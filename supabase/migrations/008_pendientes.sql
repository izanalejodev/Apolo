-- =====================================================================
-- 008: lo que quedaba pendiente de la V1
--
--   1. posts.width / posts.height   tamaño de la foto, para no recortarla
--                                   en el feed
--   2. post_likers()                quién ha dado like a una publicación
--   3. unread_conversations_count() número para el globo de la pestaña
--                                   Mensajes
--   4. push_tokens                  a qué móviles mandar notificaciones
--   5. pg_cron                      borrar denuncias de más de 12 meses
--                                   (lo promete la política de privacidad)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. TAMAÑO DE LA FOTO
-- Sin esto el feed no sabe la proporción de la foto hasta descargarla, y
-- por eso la recortaba en cuadrado. Las publicaciones viejas se quedan con
-- null y se siguen viendo cuadradas.
-- Van las dos o ninguna (una proporción con un solo dato no sirve).
-- ---------------------------------------------------------------------
alter table public.posts
  add column width  integer check (width  is null or width  between 1 and 10000),
  add column height integer check (height is null or height between 1 and 10000),
  add constraint posts_dimensiones_juntas check ((width is null) = (height is null));

-- Se suman a las columnas que ya se podían insertar (grant por columna)
grant insert (width, height) on public.posts to authenticated;


-- ---------------------------------------------------------------------
-- 2. QUIÉN HA DADO LIKE
-- Una función y no una consulta directa a likes porque hay que quitar a
-- las cuentas bloqueadas (la política de likes deja ver todas las filas,
-- que es lo que necesitan los contadores).
-- El join con posts pasa por su RLS: si no puedo ver el post (bloqueo),
-- tampoco veo sus likes.
-- Cursor (created_at, user_id), como el resto de listas.
-- ---------------------------------------------------------------------
create or replace function public.post_likers(
  target_post       uuid,
  before_created_at timestamptz default null,
  before_user       uuid        default null,
  page_size         integer     default 30
)
returns table (
  id           uuid,
  username     text,
  display_name text,
  avatar_path  text,
  liked_at     timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_path, l.created_at
  from public.likes l
  join public.posts po on po.id = l.post_id
  join public.profiles pr on pr.id = l.user_id
  where l.post_id = target_post
    and not public.is_blocked_with(l.user_id)
    and (before_created_at is null
         or (l.created_at, l.user_id) < (before_created_at, before_user))
  order by l.created_at desc, l.user_id desc
  limit least(greatest(page_size, 1), 50);
$$;

-- El índice viejo era solo (post_id): sirve para contar, pero esta lista
-- además ordena por fecha. Este sirve para las dos cosas.
drop index if exists public.likes_post_idx;
create index likes_post_created_idx on public.likes (post_id, created_at desc, user_id desc);


-- ---------------------------------------------------------------------
-- 3. CONVERSACIONES CON MENSAJES SIN LEER
-- Misma idea que "unread" de my_conversations: hay algún mensaje del otro
-- posterior a mi last_read_at. Cuenta conversaciones, no mensajes (como
-- Instagram: "3" son 3 chats pendientes).
-- ---------------------------------------------------------------------
create or replace function public.unread_conversations_count()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.conversation_members mine
  where mine.user_id = (select auth.uid())
    and exists (
      select 1 from public.messages m
      where m.conversation_id = mine.conversation_id
        and m.sender_id <> mine.user_id
        and m.created_at > mine.last_read_at
    );
$$;


-- ---------------------------------------------------------------------
-- 4. TOKENS DE NOTIFICACIONES PUSH
-- Un token = un móvil con la app instalada (lo da Expo). Una persona puede
-- tener varios (móvil y tablet).
--
-- El token es la clave y no (user_id, token) porque un móvil es de UNA
-- cuenta a la vez: si en el mismo móvil cierras sesión y entra otra
-- persona, el token pasa a ser suyo y la primera deja de recibir avisos ahí.
--
-- Por eso se registra con register_push_token() (security definer): un
-- upsert normal no podría "quitarle" la fila a la otra cuenta, porque RLS
-- solo deja tocar las filas propias. La app puede leer y borrar las suyas
-- (borrar = al cerrar sesión). Quien envía las notificaciones es la Edge
-- Function notify-message, con la service_role.
-- ---------------------------------------------------------------------
create table public.push_tokens (
  token      text primary key check (char_length(token) between 10 and 300),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy push_tokens_select on public.push_tokens
  for select to authenticated using ((select auth.uid()) = user_id);
create policy push_tokens_delete on public.push_tokens
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke insert, update on public.push_tokens from authenticated, anon;

create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  insert into public.push_tokens (token, user_id, platform)
  values (p_token, v_me, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;


-- ---------------------------------------------------------------------
-- PERMISOS DE LAS FUNCIONES
-- ---------------------------------------------------------------------
revoke execute on function public.post_likers(uuid, timestamptz, uuid, integer) from public, anon;
revoke execute on function public.unread_conversations_count()                  from public, anon;
revoke execute on function public.register_push_token(text, text)               from public, anon;
grant execute on function public.post_likers(uuid, timestamptz, uuid, integer) to authenticated;
grant execute on function public.unread_conversations_count()                  to authenticated;
grant execute on function public.register_push_token(text, text)               to authenticated;

commit;


-- ---------------------------------------------------------------------
-- 5. BORRAR DENUNCIAS DE MÁS DE 12 MESES (pg_cron)
-- La política de privacidad dice que se guardan "como máximo 12 meses".
-- pg_cron es un programador de tareas dentro de Postgres: cada noche a las
-- 3:30 (hora UTC) borra las que pasen de 12 meses, estén resueltas o no.
--
-- Fuera de la transacción de arriba a propósito: si pg_cron diera guerra,
-- lo demás ya queda aplicado. Si "create extension" falla por permisos,
-- actívala en el panel (Integrations > Cron, o Database > Extensions >
-- pg_cron) y ejecuta solo el cron.schedule.
-- cron.schedule con un nombre que ya existe actualiza la tarea, así que
-- se puede ejecutar más de una vez sin duplicarla.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'borrar-denuncias-viejas',
  '30 3 * * *',
  $$ delete from public.reports where created_at < now() - interval '12 months' $$
);

-- Comprobaciones:
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'posts' and column_name in ('width', 'height');
--   select * from cron.job;                       -- debe salir borrar-denuncias-viejas
--   select * from cron.job_run_details order by start_time desc limit 5;  -- al día siguiente
--   select * from public.unread_conversations_count();  -- sin sesión da 0, pero no error