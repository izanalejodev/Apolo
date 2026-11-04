-- =====================================================================
-- 009: llamar a las Edge Functions cuando se inserta un mensaje o una
-- denuncia (lo que hacían los "Database Webhooks" del panel, pero en SQL)
--
-- Un Database Webhook del panel es, por debajo, esto mismo: un trigger que
-- hace una petición HTTP con la extensión pg_net. Escrito aquí queda en el
-- repositorio, se monta igual en un proyecto nuevo y no depende de dónde
-- esté el menú del panel.
--
--   messages INSERT -> notify-message (notificación push)
--   reports  INSERT -> notify-report  (aviso por Telegram)
--
-- pg_net es asíncrono: apunta la petición y la manda en segundo plano. El
-- insert no espera a la Edge Function, y si la función falla el mensaje se
-- guarda igual (lo que nunca debe pasar es perder un mensaje porque falle
-- una notificación).
--
-- SECRETOS: no van en este fichero (acabaría en GitHub). Se guardan una vez
-- en Vault (almacén cifrado de Supabase) ejecutando a mano en el SQL Editor:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<el mismo valor que WEBHOOK_SECRET>', 'webhook_secret');
--
-- Para cambiar uno más adelante:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'webhook_secret'), '<nuevo>');
-- =====================================================================

begin;

create extension if not exists pg_net;

-- Función genérica: el nombre de la Edge Function llega como argumento del
-- trigger (TG_ARGV[0]). Manda el mismo formato que los webhooks del panel
-- ({ type, table, schema, record, old_record }), que es lo que esperan las
-- funciones.
--
-- security definer: el trigger se ejecuta como quien inserta (un usuario
-- normal), que no puede leer Vault ni usar pg_net. Así lo hace como el
-- dueño de la función. No tiene riesgo: una función de trigger no se
-- puede llamar directamente, solo la dispara el insert.
create or replace function public.call_edge_function()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret';

  -- Sin secretos no se llama, pero el insert sigue adelante
  if v_url is null or v_secret is null then
    raise warning 'Faltan project_url o webhook_secret en Vault: no se llama a %', tg_argv[0];
    return new;
  end if;

  perform net.http_post(
    url     := rtrim(v_url, '/') || '/functions/v1/' || tg_argv[0],
    body    := jsonb_build_object(
                 'type', tg_op,
                 'table', tg_table_name,
                 'schema', tg_table_schema,
                 'record', to_jsonb(new),
                 'old_record', null),
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke execute on function public.call_edge_function() from public, anon, authenticated;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify
  after insert on public.messages
  for each row execute function public.call_edge_function('notify-message');

drop trigger if exists reports_notify on public.reports;
create trigger reports_notify
  after insert on public.reports
  for each row execute function public.call_edge_function('notify-report');

commit;

-- Comprobaciones:
--   select name from vault.secrets;              -- project_url y webhook_secret
--   select tgname from pg_trigger
--     where tgrelid in ('public.messages'::regclass, 'public.reports'::regclass)
--       and not tgisinternal;                    -- messages_notify y reports_notify
-- Tras mandar un mensaje (las respuestas se guardan unas horas):
--   select status_code, content, created from net._http_response
--   order by created desc limit 5;
