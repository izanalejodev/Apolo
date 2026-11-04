-- =====================================================================
-- 007: aceptación de los términos de uso al registrarse
--
-- Apple (norma 1.2) exige en apps con contenido de usuarios que se acepten
-- unos términos que digan que no se tolera contenido ofensivo. Además, si
-- algún día hay que expulsar a alguien, conviene poder demostrar QUÉ
-- versión de los términos aceptó y CUÁNDO.
--
-- Tabla aparte y no columnas en profiles: profiles la puede leer cualquier
-- usuario con sesión, y esto no le importa a nadie más que a ti. Y con una
-- fila por versión, cuando cambien los términos se puede pedir que se
-- acepten otra vez sin perder el historial.
--
-- Quién escribe: el trigger de registro (security definer). La app manda
-- la versión en signUp({ options: { data: { username, terms_version } } }).
-- Si no la manda, el registro falla: la casilla se comprueba también en el
-- servidor, no solo en la pantalla.
-- =====================================================================

begin;

create table public.terms_acceptances (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  version     text not null check (char_length(version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.terms_acceptances enable row level security;

create policy terms_acceptances_select on public.terms_acceptances
  for select to authenticated using ((select auth.uid()) = user_id);

-- Solo la escribe el trigger
revoke insert, update, delete on public.terms_acceptances from authenticated, anon;


-- El trigger de auth_trigger.sql, ahora también con los términos
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_terms text := nullif(trim(new.raw_user_meta_data ->> 'terms_version'), '');
begin
  if v_terms is null then
    raise exception 'Hay que aceptar los términos de uso para registrarse';
  end if;

  insert into public.profiles (id, username)
  values (new.id, lower(trim(new.raw_user_meta_data ->> 'username')));

  insert into public.terms_acceptances (user_id, version)
  values (new.id, v_terms);

  return new;
end;
$$;

commit;

-- OJO: desde ahora "Add user" en el panel de Supabase (Authentication)
-- falla, porque no manda terms_version. Las cuentas de prueba, desde la app.
