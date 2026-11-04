-- =====================================================================
-- 003: explorar y búsqueda con filtros
--
-- Antes de ejecutar, comprueba dónde están instaladas las extensiones:
--   select extname, extnamespace::regnamespace from pg_extension;
-- En Supabase van en el esquema "extensions". Si unaccent o pg_trgm ya
-- estuvieran en "public", avísame antes de ejecutar esto.
--
-- Qué añade:
--   · f_unaccent(): quitar tildes, para que "cadiz" encuentre "Cádiz"
--   · índices para buscar por nombre (trigram) y por ciudad sin tildes
--   · search_profiles(): personas con filtros (nombre, ciudad, disciplina,
--     estilo, solo disponibles), paginado por username
--   · explore_posts(): publicaciones de todo el mundo, filtradas por la
--     ciudad/disciplina/estilo del autor, paginado como el feed
--   · popular_styles() / popular_cities(): los valores más usados, para
--     mostrarlos como chips y que no haya que adivinar cómo se escriben
--
-- Todas son security invoker: RLS se sigue aplicando como en una consulta
-- normal. Los parámetros llevan prefijo (filter_city...) porque dentro de
-- una función SQL, si un parámetro se llama igual que una columna, gana la
-- columna, y "city is null" significaría otra cosa.
-- =====================================================================

begin;

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- unaccent() no se puede usar en un índice porque Postgres no la marca como
-- "immutable" (su resultado depende de un diccionario configurable). Este
-- envoltorio fija el diccionario y así sí se puede: es el patrón habitual.
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

-- Búsqueda por nombre: un índice trigram (trozos de 3 letras) permite que
-- LIKE '%texto%' use índice, cosa que un índice normal no puede.
create index if not exists profiles_name_trgm_idx on public.profiles
  using gin (public.f_unaccent(lower(username || ' ' || coalesce(display_name, ''))) extensions.gin_trgm_ops);

-- Ciudad: comparar sin tildes ni mayúsculas ("Cádiz" = "cadiz")
drop index if exists public.profiles_city_idx;
create index profiles_city_idx on public.profiles (public.f_unaccent(lower(city)));


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

commit;
