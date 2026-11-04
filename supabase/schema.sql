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
-- EXTENSIONES Y FUNCIONES AUXILIARES (migración 003)
-- ---------------------------------------------------------------------
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- unaccent() envuelta como immutable para poder usarla en índices
create or replace function public.f_unaccent(t text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, t)
$$;


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
create index profiles_city_idx        on public.profiles (public.f_unaccent(lower(city)));
create index profiles_name_trgm_idx   on public.profiles
  using gin (public.f_unaccent(lower(username || ' ' || coalesce(display_name, ''))) extensions.gin_trgm_ops);
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
-- TERMS_ACCEPTANCES (migración 007): qué versión de los términos aceptó
-- cada uno y cuándo. La escribe el trigger de auth_trigger.sql.
-- ---------------------------------------------------------------------
create table public.terms_acceptances (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  version     text not null check (char_length(version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.terms_acceptances enable row level security;

create policy terms_acceptances_select on public.terms_acceptances
  for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.terms_acceptances from authenticated, anon;

-- ---------------------------------------------------------------------
-- BLOCKS (migración 006): si A bloquea a B, en los dos sentidos no se ven
-- posts ni comentarios, no se pueden seguir, comentar, dar like ni
-- escribirse. Va aquí, antes que posts, porque sus políticas usan
-- is_blocked_with(). Se bloquea solo con block_user() (borra los follows).
-- ---------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

create policy blocks_select on public.blocks
  for select to authenticated using ((select auth.uid()) = blocker_id);
create policy blocks_delete on public.blocks
  for delete to authenticated using ((select auth.uid()) = blocker_id);

revoke insert, update on public.blocks from authenticated, anon;

-- security definer: ve también los bloqueos que me han hecho (blocks_select no)
create or replace function public.is_blocked_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = (select auth.uid()))
  );
$$;

create or replace function public.block_user(target uuid)
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
  if target is null or target = v_me then
    raise exception 'No puedes bloquearte a ti mismo';
  end if;

  insert into public.blocks (blocker_id, blocked_id) values (v_me, target)
  on conflict do nothing;

  delete from public.follows f
  where (f.follower_id = v_me and f.followed_id = target)
     or (f.follower_id = target and f.followed_id = v_me);
end;
$$;

revoke execute on function public.is_blocked_with(uuid) from public, anon;
revoke execute on function public.block_user(uuid)      from public, anon;
grant execute on function public.is_blocked_with(uuid) to authenticated;
grant execute on function public.block_user(uuid)      to authenticated;


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
  -- Tamaño de la foto (migración 008), para pintarla sin recortar. Null en
  -- las publicaciones anteriores
  width            integer check (width  is null or width  between 1 and 10000),
  height           integer check (height is null or height between 1 and 10000),
  created_at       timestamptz not null default now(),

  constraint posts_video_has_duration check ((media_type = 'video') = (duration_seconds is not null)),
  constraint posts_tags_limites       check (cardinality(tags) <= 30),
  constraint posts_dimensiones_juntas check ((width is null) = (height is null))
);

-- Perfil y feed cronológico: "posts de X ordenados por fecha"
create index posts_author_created_idx on public.posts (author_id, created_at desc);
create index posts_created_idx        on public.posts (created_at desc);
create index posts_tags_idx           on public.posts using gin (tags);

alter table public.posts enable row level security;

create policy posts_select on public.posts
  for select to authenticated using (not public.is_blocked_with(author_id));

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
grant insert (author_id, caption, media_path, media_type, duration_seconds, tags, width, height)
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
  for insert to authenticated
  with check ((select auth.uid()) = follower_id and not public.is_blocked_with(followed_id));
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

-- Contar likes y listar quién los dio, más recientes primero (migración 008)
create index likes_post_created_idx on public.likes (post_id, created_at desc, user_id desc);

alter table public.likes enable row level security;

create policy likes_select on public.likes
  for select to authenticated using (true);
create policy likes_insert on public.likes
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and not public.is_blocked_with((select p.author_id from public.posts p where p.id = post_id))
  );
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

-- Comentarios de un post, más nuevos primero, paginando por (created_at, id)
create index comments_post_created_idx on public.comments (post_id, created_at desc, id desc);

alter table public.comments enable row level security;

create policy comments_select on public.comments
  for select to authenticated using (not public.is_blocked_with(author_id));
create policy comments_insert on public.comments
  for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and not public.is_blocked_with((select p.author_id from public.posts p where p.id = post_id))
  );
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
-- CONTADORES DE POSTS (migración 004): campos calculados de PostgREST.
-- Una función que recibe una fila de posts se pide en el select como una
-- columna más: .select('*, like_count, comment_count, liked_by_me')
-- ---------------------------------------------------------------------
create or replace function public.like_count(p public.posts)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*) from public.likes l where l.post_id = p.id;
$$;

create or replace function public.comment_count(p public.posts)
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*) from public.comments c where c.post_id = p.id;
$$;

create or replace function public.liked_by_me(p public.posts)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.likes l
    where l.post_id = p.id and l.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.like_count(public.posts)    from public, anon;
revoke execute on function public.comment_count(public.posts) from public, anon;
revoke execute on function public.liked_by_me(public.posts)   from public, anon;
grant execute on function public.like_count(public.posts)    to authenticated;
grant execute on function public.comment_count(public.posts) to authenticated;
grant execute on function public.liked_by_me(public.posts)   to authenticated;

-- Quién ha dado like (migración 008). Sin las cuentas bloqueadas; el join
-- con posts pasa por su RLS
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

revoke execute on function public.post_likers(uuid, timestamptz, uuid, integer) from public, anon;
grant execute on function public.post_likers(uuid, timestamptz, uuid, integer) to authenticated;


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


-- ---------------------------------------------------------------------
-- EXPLORAR Y BÚSQUEDA (migración 003). Parámetros con prefijo filter_
-- porque en SQL, si un parámetro se llama como una columna, gana la columna.
-- ---------------------------------------------------------------------
create or replace function public.search_profiles(
  search_text       text    default null,
  filter_city       text    default null,
  filter_discipline text    default null,
  filter_style      text    default null,
  only_available    boolean default false,
  after_username    text    default null,
  page_size         integer default 20
)
returns setof public.profiles
language sql
stable
security invoker
set search_path = ''
as $$
  select p.*
  from public.profiles p
  where p.id <> (select auth.uid())  -- no me busco a mí mismo
    and not public.is_blocked_with(p.id)
    and (
      search_text is null
      -- % y _ son comodines de LIKE; se escapan para que "izan_a" busque
      -- exactamente eso (el _ es muy común en usernames)
      or public.f_unaccent(lower(p.username || ' ' || coalesce(p.display_name, '')))
         like '%' || replace(replace(replace(public.f_unaccent(lower(trim(search_text))),
                       '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
    and (filter_city is null
         or public.f_unaccent(lower(p.city)) = public.f_unaccent(lower(trim(filter_city))))
    and (filter_discipline is null or p.disciplines @> array[filter_discipline])
    and (filter_style is null or p.styles @> array[lower(trim(filter_style))])
    and (not only_available or p.availability = 'available')
    and (after_username is null or p.username > after_username)
  order by p.username
  limit least(greatest(page_size, 1), 50);
$$;


create or replace function public.explore_posts(
  filter_city       text        default null,
  filter_discipline text        default null,
  filter_style      text        default null,
  before_created_at timestamptz default null,
  before_id         uuid        default null,
  page_size         integer     default 30
)
returns setof public.posts
language sql
stable
security invoker
set search_path = ''
as $$
  select po.*
  from public.posts po
  join public.profiles p on p.id = po.author_id
  where (filter_city is null
         or public.f_unaccent(lower(p.city)) = public.f_unaccent(lower(trim(filter_city))))
    and (filter_discipline is null or p.disciplines @> array[filter_discipline])
    and (filter_style is null or p.styles @> array[lower(trim(filter_style))])
    and (before_created_at is null or (po.created_at, po.id) < (before_created_at, before_id))
  order by po.created_at desc, po.id desc
  limit least(greatest(page_size, 1), 60);
$$;


-- Estilos más usados en los perfiles ("hip hop" 12, "popping" 7...)
create or replace function public.popular_styles(max_results integer default 30)
returns table (value text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select s, count(*)
  from public.profiles p, unnest(p.styles) as s
  group by s
  order by count(*) desc, s
  limit least(greatest(max_results, 1), 100);
$$;

-- Ciudades más usadas. Se agrupan sin tildes ni mayúsculas ("Cádiz",
-- "cadiz" y "CADIZ" cuentan como una) y se muestra la forma más escrita.
create or replace function public.popular_cities(max_results integer default 30)
returns table (value text, n bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select mode() within group (order by p.city), count(*)
  from public.profiles p
  where p.city is not null
  group by public.f_unaccent(lower(p.city))
  order by count(*) desc, 1
  limit least(greatest(max_results, 1), 100);
$$;


-- Solo usuarios con sesión. (f_unaccent se deja ejecutable: es una función
-- pura que solo quita tildes, no lee ningún dato.)
revoke execute on function public.search_profiles(text, text, text, text, boolean, text, integer) from public, anon;
revoke execute on function public.explore_posts(text, text, text, timestamptz, uuid, integer)    from public, anon;
revoke execute on function public.popular_styles(integer) from public, anon;
revoke execute on function public.popular_cities(integer) from public, anon;
grant execute on function public.search_profiles(text, text, text, text, boolean, text, integer) to authenticated;
grant execute on function public.explore_posts(text, text, text, timestamptz, uuid, integer)    to authenticated;
grant execute on function public.popular_styles(integer) to authenticated;
grant execute on function public.popular_cities(integer) to authenticated;


-- ---------------------------------------------------------------------
-- CHAT (migración 005): mensajes directos 1 a 1. Tabla de miembros para
-- poder tener grupos más adelante. Las conversaciones solo se crean con
-- get_or_create_dm() (la app no puede insertar en conversations ni en
-- conversation_members). messages está en la publicación de Realtime.
-- ---------------------------------------------------------------------
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  dm_key     text unique,  -- "uuidMenor:uuidMayor" en las de dos; null en grupos
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  last_read_at    timestamptz not null default now(),  -- posterior y no mío = no leído
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(trim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);

-- security definer para evitar la recursión infinita en la política de
-- conversation_members (que tiene que consultar conversation_members)
create or replace function public.is_conversation_member(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.conversation_blocked(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv
      and m.user_id <> (select auth.uid())
      and public.is_blocked_with(m.user_id)
  );
$$;

revoke execute on function public.conversation_blocked(uuid) from public, anon;
grant execute on function public.conversation_blocked(uuid) to authenticated;

alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id));

create policy conversation_members_select on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy conversation_members_update on public.conversation_members
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.is_conversation_member(conversation_id)
    and not public.conversation_blocked(conversation_id)
  );

revoke insert, update, delete on public.conversations        from authenticated, anon;
revoke insert, update, delete on public.conversation_members from authenticated, anon;
revoke insert, update, delete on public.messages             from authenticated, anon;
grant update (last_read_at) on public.conversation_members to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;

create or replace function public.get_or_create_dm(other_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_key  text;
  v_conv uuid;
begin
  if v_me is null then
    raise exception 'Hace falta iniciar sesión';
  end if;
  if other_user is null or other_user = v_me then
    raise exception 'No puedes escribirte a ti mismo';
  end if;
  if not exists (select 1 from public.profiles p where p.id = other_user) then
    raise exception 'Ese usuario no existe';
  end if;
  if public.is_blocked_with(other_user) then
    raise exception 'No puedes escribir a esta persona';
  end if;

  v_key := least(v_me::text, other_user::text) || ':' || greatest(v_me::text, other_user::text);

  insert into public.conversations (dm_key) values (v_key)
  on conflict (dm_key) do nothing
  returning id into v_conv;

  if v_conv is null then
    select c.id into v_conv from public.conversations c where c.dm_key = v_key;
  else
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, v_me), (v_conv, other_user);
  end if;

  return v_conv;
end;
$$;

create or replace function public.mark_conversation_read(conv uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = conv and user_id = (select auth.uid());
$$;

create or replace function public.my_conversations(
  before_last_at timestamptz default null,
  before_id      uuid        default null,
  page_size      integer     default 30
)
returns table (
  conversation_id    uuid,
  other_id           uuid,
  other_username     text,
  other_display_name text,
  other_avatar_path  text,
  last_body          text,
  last_sender_id     uuid,
  last_at            timestamptz,
  unread             boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    mine.conversation_id,
    p.id, p.username, p.display_name, p.avatar_path,
    lm.body, lm.sender_id, lm.created_at,
    lm.sender_id <> mine.user_id and lm.created_at > mine.last_read_at
  from public.conversation_members mine
  join public.conversations c
    on c.id = mine.conversation_id and c.dm_key is not null
  join public.conversation_members other
    on other.conversation_id = mine.conversation_id and other.user_id <> mine.user_id
  join public.profiles p on p.id = other.user_id
  cross join lateral (
    select m.body, m.sender_id, m.created_at
    from public.messages m
    where m.conversation_id = mine.conversation_id
    order by m.created_at desc, m.id desc
    limit 1
  ) lm
  where mine.user_id = (select auth.uid())
    and (before_last_at is null
         or (lm.created_at, mine.conversation_id) < (before_last_at, before_id))
  order by lm.created_at desc, mine.conversation_id desc
  limit least(greatest(page_size, 1), 50);
$$;

revoke execute on function public.is_conversation_member(uuid)                  from public, anon;
revoke execute on function public.get_or_create_dm(uuid)                        from public, anon;
revoke execute on function public.mark_conversation_read(uuid)                  from public, anon;
revoke execute on function public.my_conversations(timestamptz, uuid, integer)  from public, anon;
grant execute on function public.is_conversation_member(uuid)                  to authenticated;
grant execute on function public.get_or_create_dm(uuid)                        to authenticated;
grant execute on function public.mark_conversation_read(uuid)                  to authenticated;
grant execute on function public.my_conversations(timestamptz, uuid, integer)  to authenticated;

-- Conversaciones con algo sin leer, para el globo de la pestaña (migración 008)
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

revoke execute on function public.unread_conversations_count() from public, anon;
grant execute on function public.unread_conversations_count() to authenticated;


-- ---------------------------------------------------------------------
-- PUSH_TOKENS (migración 008): un token por móvil, de una sola cuenta a la
-- vez. Se registra con register_push_token(); la app lee y borra los suyos.
-- Las notificaciones las manda la Edge Function notify-message.
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

revoke execute on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;

alter publication supabase_realtime add table public.messages;


-- ---------------------------------------------------------------------
-- REPORTS (migración 006): denuncias. Sin políticas: la app solo denuncia
-- con report_content(), que saca de la BD de quién es el contenido y guarda
-- una copia. Se revisan en el panel de Supabase (service_role).
-- ---------------------------------------------------------------------
create type public.report_target_kind as enum ('post', 'comment', 'message', 'profile');
create type public.report_reason      as enum ('spam', 'harassment', 'hate', 'nudity',
                                               'violence', 'impersonation', 'other');
create type public.report_status      as enum ('pending', 'resolved', 'dismissed');

create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  -- set null y no cascade: la denuncia se queda aunque alguien borre su cuenta
  reporter_id      uuid references public.profiles (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,
  target_kind      public.report_target_kind not null,
  target_id        uuid not null,  -- sin FK a propósito: el contenido puede borrarse
  reason           public.report_reason not null,
  details          text check (char_length(details) <= 1000),
  snapshot         jsonb not null,  -- copia del contenido al denunciar
  status           public.report_status not null default 'pending',
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  -- Una denuncia por persona y contenido: denunciar 50 veces no cuenta 50
  unique (reporter_id, target_kind, target_id)
);

-- Lo que miras al revisar: las pendientes, más antiguas primero
create index reports_status_created_idx on public.reports (status, created_at);
-- "¿Cuántas denuncias tiene este usuario?"
create index reports_reported_user_idx  on public.reports (reported_user_id);

-- RLS activado y SIN políticas: desde la app nadie lee ni escribe aquí
-- directamente. Se entra solo por report_content(). (El panel de Supabase
-- usa la service_role, que se salta RLS: ahí es donde se revisan.)
alter table public.reports enable row level security;
revoke all on public.reports from authenticated, anon;


create or replace function public.report_content(
  p_kind    public.report_target_kind,
  p_target  uuid,
  p_reason  public.report_reason,
  p_details text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me   uuid := (select auth.uid());
  v_user uuid;
  v_snap jsonb;
begin
  if v_me is null then
    raise exception 'Hace falta iniciar sesión';
  end if;

  -- De quién es y qué decía, sacado de la BD (no de lo que diga la app)
  if p_kind = 'post' then
    select po.author_id,
           jsonb_build_object('caption', po.caption, 'media_path', po.media_path,
                              'media_type', po.media_type, 'created_at', po.created_at)
      into v_user, v_snap
      from public.posts po where po.id = p_target;
  elsif p_kind = 'comment' then
    select c.author_id,
           jsonb_build_object('body', c.body, 'post_id', c.post_id, 'created_at', c.created_at)
      into v_user, v_snap
      from public.comments c where c.id = p_target;
  elsif p_kind = 'message' then
    -- Solo puedo denunciar mensajes de conversaciones donde estoy
    select m.sender_id,
           jsonb_build_object('body', m.body, 'conversation_id', m.conversation_id,
                              'created_at', m.created_at)
      into v_user, v_snap
      from public.messages m
     where m.id = p_target and public.is_conversation_member(m.conversation_id);
  elsif p_kind = 'profile' then
    select pr.id,
           jsonb_build_object('username', pr.username, 'display_name', pr.display_name,
                              'bio', pr.bio, 'avatar_path', pr.avatar_path,
                              'services_text', pr.services_text, 'contact_link', pr.contact_link)
      into v_user, v_snap
      from public.profiles pr where pr.id = p_target;
  end if;

  if v_user is null then
    raise exception 'No se encontró el contenido';
  end if;
  if v_user = v_me then
    raise exception 'No puedes denunciar algo tuyo';
  end if;

  insert into public.reports (reporter_id, reported_user_id, target_kind, target_id,
                              reason, details, snapshot)
  values (v_me, v_user, p_kind, p_target, p_reason,
          nullif(left(trim(p_details), 1000), ''), v_snap)
  on conflict (reporter_id, target_kind, target_id) do nothing;
end;
$$;

revoke execute on function public.report_content(public.report_target_kind, uuid, public.report_reason, text) from public, anon;
grant execute on function public.report_content(public.report_target_kind, uuid, public.report_reason, text) to authenticated;


-- ---------------------------------------------------------------------
-- LIMPIEZA PROGRAMADA (migración 008): denuncias de más de 12 meses
-- ---------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'borrar-denuncias-viejas',
  '30 3 * * *',
  $$ delete from public.reports where created_at < now() - interval '12 months' $$
);
