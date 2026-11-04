-- =====================================================================
-- Esquema de la base de datos (Supabase / Postgres)
--
-- Reconstruido a partir del CLAUDE.md y del código de la app: el SQL
-- original se ejecutó en el panel y no estaba guardado. Antes de volver
-- a ejecutarlo, compáralo con lo que hay en Supabase (Table Editor y
-- Authentication → Policies).
--
-- Se puede ejecutar varias veces sin romper nada: usa "if not exists"
-- y borra cada política antes de crearla.
--
-- Reglas del proyecto:
--   · Todas las tablas con RLS. Los permisos viven aquí, no en la app.
--   · Sin contadores guardados (likes, seguidores): se calculan con count(*).
-- =====================================================================


-- ---------------------------------------------------------------------
-- PROFILES: un perfil por usuario de auth.users (lo crea el trigger de
-- auth_trigger.sql al registrarse).
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique
                check (username ~ '^[a-z0-9_.]{3,30}$'),  -- misma regla que login.tsx
  display_name  text check (char_length(display_name) <= 50),
  bio           text check (char_length(bio) <= 300),
  avatar_url    text,

  -- Capa profesional mínima (V1)
  city          text check (char_length(city) <= 80),
  disciplines   text[] not null default '{}',  -- p. ej. {baile, canto}
  styles        text[] not null default '{}',  -- p. ej. {hip hop, popping}
  availability  text check (char_length(availability) <= 200),
  services_text text check (char_length(services_text) <= 1000),
  contact_link  text check (char_length(contact_link) <= 300),

  created_at    timestamptz not null default now()
);

-- Índices para la búsqueda con filtros (ciudad, disciplinas, estilos)
create index if not exists profiles_city_idx        on public.profiles (lower(city));
create index if not exists profiles_disciplines_idx on public.profiles using gin (disciplines);
create index if not exists profiles_styles_idx      on public.profiles using gin (styles);

alter table public.profiles enable row level security;

drop policy if exists "profiles: cualquiera logueado puede ver" on public.profiles;
create policy "profiles: cualquiera logueado puede ver"
  on public.profiles for select to authenticated
  using (true);

drop policy if exists "profiles: cada uno edita el suyo" on public.profiles;
create policy "profiles: cada uno edita el suyo"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No hay política de INSERT ni DELETE: el perfil lo crea el trigger
-- (security definer) y se borra en cascada al borrar el usuario.

-- La política de UPDATE dice QUÉ FILA puedes tocar (la tuya), pero no qué
-- COLUMNAS. Sin esto podrías cambiarte id, created_at o username desde la
-- consola del navegador. Así solo se pueden editar estas columnas.
-- (Debe coincidir con ProfileUpdate en lib/profile.ts.)
revoke update on public.profiles from authenticated, anon;
grant update (display_name, bio, city, disciplines, styles,
              availability, services_text, contact_link)
  on public.profiles to authenticated;

-- Reglas de contenido del perfil (la app comprueba lo mismo, pero la que
-- manda es la base de datos). Drop + add para poder re-ejecutar el fichero.
alter table public.profiles drop constraint if exists profiles_disciplines_validas;
alter table public.profiles add constraint profiles_disciplines_validas check (
  -- misma lista que DISCIPLINES en lib/profile.ts
  disciplines <@ array['baile','canto','musica','dj','fotografia','video',
                       'actuacion','artes_visuales']::text[]
  and cardinality(disciplines) <= 5
);

alter table public.profiles drop constraint if exists profiles_styles_limites;
alter table public.profiles add constraint profiles_styles_limites check (
  cardinality(styles) <= 15
  and char_length(array_to_string(styles, ',')) <= 500
);

alter table public.profiles drop constraint if exists profiles_contact_link_http;
alter table public.profiles add constraint profiles_contact_link_http check (
  contact_link is null or contact_link ~* '^https?://'
);


-- ---------------------------------------------------------------------
-- POSTS: publicaciones de foto o vídeo (vídeo de 60 s como máximo)
-- ---------------------------------------------------------------------
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles (id) on delete cascade,
  caption     text check (char_length(caption) <= 2200),
  media_url   text not null,
  media_type  text not null check (media_type in ('image', 'video')),
  duration_s  numeric check (duration_s is null or duration_s <= 60),
  created_at  timestamptz not null default now(),

  -- un vídeo debe indicar su duración; una imagen no
  check ((media_type = 'video') = (duration_s is not null))
);

-- Feed cronológico y perfil: "posts de X ordenados por fecha"
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists posts_created_idx        on public.posts (created_at desc);

alter table public.posts enable row level security;

drop policy if exists "posts: cualquiera logueado puede ver" on public.posts;
create policy "posts: cualquiera logueado puede ver"
  on public.posts for select to authenticated
  using (true);

drop policy if exists "posts: publicas solo como tú" on public.posts;
create policy "posts: publicas solo como tú"
  on public.posts for insert to authenticated
  with check ((select auth.uid()) = author_id);

drop policy if exists "posts: editas solo los tuyos" on public.posts;
create policy "posts: editas solo los tuyos"
  on public.posts for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

drop policy if exists "posts: borras solo los tuyos" on public.posts;
create policy "posts: borras solo los tuyos"
  on public.posts for delete to authenticated
  using ((select auth.uid()) = author_id);


-- ---------------------------------------------------------------------
-- FOLLOWS: seguidores unidireccionales (follower sigue a following)
-- ---------------------------------------------------------------------
create table if not exists public.follows (
  follower_id  uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),   -- no se puede seguir dos veces
  check (follower_id <> following_id)        -- ni seguirse a uno mismo
);

-- La PK ya cubre "¿a quién sigo?"; este índice cubre "¿quién me sigue?"
create index if not exists follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

drop policy if exists "follows: cualquiera logueado puede ver" on public.follows;
create policy "follows: cualquiera logueado puede ver"
  on public.follows for select to authenticated
  using (true);

drop policy if exists "follows: sigues solo en tu nombre" on public.follows;
create policy "follows: sigues solo en tu nombre"
  on public.follows for insert to authenticated
  with check ((select auth.uid()) = follower_id);

drop policy if exists "follows: dejas de seguir solo tú" on public.follows;
create policy "follows: dejas de seguir solo tú"
  on public.follows for delete to authenticated
  using ((select auth.uid()) = follower_id);


-- ---------------------------------------------------------------------
-- LIKES: un like por usuario y post
-- ---------------------------------------------------------------------
create table if not exists public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists likes_post_idx on public.likes (post_id);

alter table public.likes enable row level security;

drop policy if exists "likes: cualquiera logueado puede ver" on public.likes;
create policy "likes: cualquiera logueado puede ver"
  on public.likes for select to authenticated
  using (true);

drop policy if exists "likes: das like solo como tú" on public.likes;
create policy "likes: das like solo como tú"
  on public.likes for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "likes: quitas solo los tuyos" on public.likes;
create policy "likes: quitas solo los tuyos"
  on public.likes for delete to authenticated
  using ((select auth.uid()) = user_id);


-- ---------------------------------------------------------------------
-- COMMENTS
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists comments_post_created_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

drop policy if exists "comments: cualquiera logueado puede ver" on public.comments;
create policy "comments: cualquiera logueado puede ver"
  on public.comments for select to authenticated
  using (true);

drop policy if exists "comments: comentas solo como tú" on public.comments;
create policy "comments: comentas solo como tú"
  on public.comments for insert to authenticated
  with check ((select auth.uid()) = author_id);

-- Puede borrar un comentario su autor o el dueño del post
drop policy if exists "comments: borra el autor o el dueño del post" on public.comments;
create policy "comments: borra el autor o el dueño del post"
  on public.comments for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = (select p.author_id from public.posts p where p.id = post_id)
  );
