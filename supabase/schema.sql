-- =====================================================================
-- Esquema completo de la base de datos (Supabase / Postgres)
--
-- QUÉ ES: la foto del estado actual, para montar un proyecto de Supabase
-- NUEVO desde cero (p. ej. uno de pruebas). Orden: este fichero,
-- auth_trigger.sql y storage.sql.
--
-- QUÉ NO ES: la forma de cambiar la base de datos que ya existe. Los
-- cambios van en supabase/migrations/NNN_descripcion.sql, se ejecutan una
-- vez, y después se actualiza este fichero para que siga reflejando la
-- realidad. (Mezclar las dos cosas es lo que hizo que este fichero y la
-- base de datos real se separaran.)
--
-- Reglas del proyecto:
--   · Todas las tablas con RLS. Los permisos viven aquí, no en la app.
--   · Sin contadores guardados (likes, seguidores): se calculan con count(*).
--   · RLS dice QUÉ FILAS puede tocar cada uno; los grant por columna dicen
--     QUÉ COLUMNAS. Hacen falta los dos.
--   · (select auth.uid()) en las políticas: se evalúa una vez por consulta.
-- =====================================================================


-- ---------------------------------------------------------------------
-- TIPOS
-- ---------------------------------------------------------------------
create type public.availability_status as enum ('available', 'busy', 'not_looking');
create type public.media_kind          as enum ('image', 'video');


-- ---------------------------------------------------------------------
-- PROFILES: un perfil por usuario (lo crea el trigger de auth_trigger.sql)
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique
                check (username ~ '^[a-z0-9_.]{3,30}$'),  -- misma regla que login.tsx
  display_name  text check (char_length(display_name) <= 60),
  bio           text check (char_length(bio) <= 300),
  avatar_path   text,  -- ruta en el bucket 'avatars' (no la URL completa)

  -- Capa profesional mínima (V1)
  city          text check (char_length(city) <= 80),
  disciplines   text[] not null default '{}',
  styles        text[] not null default '{}',
  availability  public.availability_status not null default 'not_looking',
  services_text text check (char_length(services_text) <= 500),
  contact_link  text check (char_length(contact_link) <= 300),

  created_at    timestamptz not null default now(),

  -- misma lista que DISCIPLINES en lib/profile.ts
  constraint profiles_disciplines_validas check (
    disciplines <@ array['baile','canto','musica','dj','fotografia','video',
                         'actuacion','artes_visuales']::text[]
    and cardinality(disciplines) <= 5
  ),
  constraint profiles_styles_limites check (
    cardinality(styles) <= 15
    and char_length(array_to_string(styles, ',')) <= 500
  ),
  constraint profiles_contact_link_http check (
    contact_link is null or contact_link ~* '^https?://'
  )
);

-- Búsqueda con filtros (ciudad, disciplinas, estilos)
create index profiles_city_idx        on public.profiles (lower(city));
create index profiles_disciplines_idx on public.profiles using gin (disciplines);
create index profiles_styles_idx      on public.profiles using gin (styles);

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated using (true);

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and (avatar_path is null or split_part(avatar_path, '/', 1) = (select auth.uid())::text)
  );

-- Sin INSERT ni DELETE: el perfil lo crea el trigger (security definer) y
-- se borra en cascada al borrar el usuario.

-- Columnas editables (debe coincidir con ProfileUpdate en lib/profile.ts)
revoke insert, update on public.profiles from authenticated, anon;
grant update (display_name, bio, avatar_path, city, disciplines, styles,
              availability, services_text, contact_link)
  on public.profiles to authenticated;


-- ---------------------------------------------------------------------
-- POSTS: publicaciones de foto o vídeo (vídeo de 60 s como máximo)
-- ---------------------------------------------------------------------
create table public.posts (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.profiles (id) on delete cascade,
  caption          text check (char_length(caption) <= 2200),
  media_path       text not null,  -- ruta en el bucket 'posts' (no la URL completa)
  media_type       public.media_kind not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds <= 60),
  tags             text[] not null default '{}',
  created_at       timestamptz not null default now(),

  constraint posts_video_has_duration check ((media_type = 'video') = (duration_seconds is not null)),
  constraint posts_tags_limites       check (cardinality(tags) <= 30)
);

-- Perfil y feed cronológico: "posts de X ordenados por fecha"
create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index posts_created_idx        on public.posts (created_at desc);
create index posts_tags_idx           on public.posts using gin (tags);

alter table public.posts enable row level security;

create policy posts_select on public.posts
  for select to authenticated using (true);

create policy posts_insert on public.posts
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and split_part(media_path, '/', 1) = (select auth.uid())::text
  );

create policy posts_update on public.posts
  for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

create policy posts_delete on public.posts
  for delete to authenticated
  using ((select auth.uid()) = author_id);

-- Al publicar no se puede elegir id ni created_at; al editar, solo el texto
revoke insert, update on public.posts from authenticated, anon;
grant insert (author_id, caption, media_path, media_type, duration_seconds, tags)
  on public.posts to authenticated;
grant update (caption, tags) on public.posts to authenticated;


-- ---------------------------------------------------------------------
-- FOLLOWS: seguidores unidireccionales (follower sigue a followed)
-- ---------------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),  -- no se puede seguir dos veces
  check (follower_id <> followed_id)       -- ni seguirse a uno mismo
);

-- La PK cubre "¿a quién sigo?"; este índice cubre "¿quién me sigue?"
create index follows_followed_idx on public.follows (followed_id);

alter table public.follows enable row level security;

create policy follows_select on public.follows
  for select to authenticated using (true);
create policy follows_insert on public.follows
  for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy follows_delete on public.follows
  for delete to authenticated using ((select auth.uid()) = follower_id);

revoke insert, update on public.follows from authenticated, anon;
grant insert (follower_id, followed_id) on public.follows to authenticated;


-- ---------------------------------------------------------------------
-- LIKES: un like por usuario y post
-- ---------------------------------------------------------------------
create table public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  post_id    uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index likes_post_idx on public.likes (post_id);

alter table public.likes enable row level security;

create policy likes_select on public.likes
  for select to authenticated using (true);
create policy likes_insert on public.likes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy likes_delete on public.likes
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke insert, update on public.likes from authenticated, anon;
grant insert (user_id, post_id) on public.likes to authenticated;


-- ---------------------------------------------------------------------
-- COMMENTS
-- ---------------------------------------------------------------------
create table public.comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index comments_post_created_idx on public.comments (post_id, created_at);

alter table public.comments enable row level security;

create policy comments_select on public.comments
  for select to authenticated using (true);
create policy comments_insert on public.comments
  for insert to authenticated with check ((select auth.uid()) = author_id);
-- Puede borrar el autor del comentario o el dueño del post
create policy comments_delete on public.comments
  for delete to authenticated
  using (
    (select auth.uid()) = author_id
    or (select auth.uid()) = (select p.author_id from public.posts p where p.id = post_id)
  );

revoke insert, update on public.comments from authenticated, anon;
grant insert (post_id, author_id, body) on public.comments to authenticated;


-- ---------------------------------------------------------------------
-- FEED: posts míos y de a quien sigo, más recientes primero (migración 002)
-- Paginación por cursor: la app pasa created_at e id del último post.
-- security invoker -> las políticas RLS se siguen aplicando.
-- ---------------------------------------------------------------------
create or replace function public.feed(
  before_created_at timestamptz default null,
  before_id         uuid        default null,
  page_size         integer     default 20
)
returns setof public.posts
language sql
stable
security invoker
set search_path = ''
as $$
  select p.*
  from public.posts p
  where (
      p.author_id = (select auth.uid())
      or exists (
        select 1 from public.follows f
        where f.follower_id = (select auth.uid())
          and f.followed_id = p.author_id
      )
    )
    and (
      before_created_at is null
      or (p.created_at, p.id) < (before_created_at, before_id)
    )
  order by p.created_at desc, p.id desc
  limit least(greatest(page_size, 1), 50);
$$;

revoke execute on function public.feed(timestamptz, uuid, integer) from public, anon;
grant execute on function public.feed(timestamptz, uuid, integer) to authenticated;
