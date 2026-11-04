-- =====================================================================
-- Migración 001: alinear la base de datos real con lo que espera la app
--
-- EJECUTAR UNA SOLA VEZ (renombra columnas: una segunda vez fallaría,
-- sin romper nada). Después, ejecutar supabase/storage.sql.
--
-- Va entre begin/commit: o se aplica entero o no se aplica nada.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------
-- 1. Guardar rutas de Storage, no URLs (ver lib/media.ts, publicUrl)
-- ---------------------------------------------------------------------
alter table public.profiles rename column avatar_url to avatar_path;
alter table public.posts    rename column media_url  to media_path;


-- ---------------------------------------------------------------------
-- 2. Reglas de contenido que faltaban
-- ---------------------------------------------------------------------
alter table public.profiles add constraint profiles_city_check
  check (char_length(city) <= 80);
alter table public.profiles add constraint profiles_contact_link_check
  check (char_length(contact_link) <= 300);

-- Un vídeo lleva duración y una imagen no
alter table public.posts add constraint posts_video_has_duration
  check ((media_type = 'video') = (duration_seconds is not null));
alter table public.posts add constraint posts_tags_limites
  check (cardinality(tags) <= 30);

-- Antes "   " (solo espacios) contaba como comentario válido
alter table public.comments drop constraint comments_body_check;
alter table public.comments add constraint comments_body_check
  check (char_length(trim(body)) between 1 and 500);


-- ---------------------------------------------------------------------
-- 3. Políticas RLS, rehechas
--    · "to authenticated": sin sesión no se ve ni se toca nada
--    · (select auth.uid()) en vez de auth.uid(): Postgres lo calcula una
--      vez por consulta y no una por fila (recomendación de Supabase)
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.posts    enable row level security;
alter table public.follows  enable row level security;
alter table public.likes    enable row level security;
alter table public.comments enable row level security;

-- PROFILES
drop policy profiles_select on public.profiles;
drop policy profiles_insert on public.profiles;  -- el perfil lo crea el trigger, nadie más
drop policy profiles_update on public.profiles;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    -- el avatar tiene que ser un archivo de tu carpeta, no el de otro
    and (avatar_path is null or split_part(avatar_path, '/', 1) = (select auth.uid())::text)
  );

-- POSTS
drop policy posts_select on public.posts;
drop policy posts_insert on public.posts;
drop policy posts_update on public.posts;
drop policy posts_delete on public.posts;

create policy posts_select on public.posts
  for select to authenticated using (true);

create policy posts_insert on public.posts
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    -- solo puedes publicar archivos de tu carpeta
    and split_part(media_path, '/', 1) = (select auth.uid())::text
  );

create policy posts_update on public.posts
  for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

create policy posts_delete on public.posts
  for delete to authenticated
  using ((select auth.uid()) = author_id);

-- FOLLOWS
drop policy follows_select on public.follows;
drop policy follows_insert on public.follows;
drop policy follows_delete on public.follows;

create policy follows_select on public.follows
  for select to authenticated using (true);
create policy follows_insert on public.follows
  for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy follows_delete on public.follows
  for delete to authenticated using ((select auth.uid()) = follower_id);

-- LIKES
drop policy likes_select on public.likes;
drop policy likes_insert on public.likes;
drop policy likes_delete on public.likes;

create policy likes_select on public.likes
  for select to authenticated using (true);
create policy likes_insert on public.likes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy likes_delete on public.likes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- COMMENTS
drop policy comments_select on public.comments;
drop policy comments_insert on public.comments;
drop policy comments_delete on public.comments;

create policy comments_select on public.comments
  for select to authenticated using (true);
create policy comments_insert on public.comments
  for insert to authenticated with check ((select auth.uid()) = author_id);
-- Nuevo: también puede borrar el dueño del post (moderar su publicación)
create policy comments_delete on public.comments
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = (select p.author_id from public.posts p where p.id = post_id)
  );


-- ---------------------------------------------------------------------
-- 4. Permisos por columna
--    RLS decide QUÉ FILAS; esto decide QUÉ COLUMNAS. Así nadie puede
--    escribir id, created_at o username a mano.
-- ---------------------------------------------------------------------
revoke insert, update on public.profiles from authenticated, anon;
grant update (display_name, bio, avatar_path, city, disciplines, styles,
              availability, services_text, contact_link)
  on public.profiles to authenticated;

revoke insert, update on public.posts from authenticated, anon;
grant insert (author_id, caption, media_path, media_type, duration_seconds, tags)
  on public.posts to authenticated;
grant update (caption, tags) on public.posts to authenticated;

revoke insert, update on public.follows from authenticated, anon;
grant insert (follower_id, followed_id) on public.follows to authenticated;

revoke insert, update on public.likes from authenticated, anon;
grant insert (user_id, post_id) on public.likes to authenticated;

revoke insert, update on public.comments from authenticated, anon;
grant insert (post_id, author_id, body) on public.comments to authenticated;

commit;
