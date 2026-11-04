-- =====================================================================
-- Crea el perfil automáticamente cuando alguien se registra.
--
-- La app manda el username y la versión de los términos en
-- signUp({ options: { data: { username, terms_version } } }),
-- que Supabase guarda en auth.users.raw_user_meta_data. Este trigger lo
-- copia a public.profiles y public.terms_acceptances.
--
-- Si el username no es válido o ya existe, el INSERT falla, y con él
-- todo el registro: Supabase devuelve "Database error saving new user",
-- que login.tsx traduce a un mensaje amable.
--
-- Ejecutar después de schema.sql. Se puede volver a ejecutar sin problema.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer          -- corre con permisos del dueño: puede insertar
set search_path = ''      -- evita que alguien suplante tablas vía search_path
as $$
declare
  -- Versión de los términos aceptados (migración 007). Sin ella, el
  -- registro falla: la casilla se valida también en el servidor.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
