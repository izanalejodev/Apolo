-- =====================================================================
-- 002: función feed() para el feed cronológico
--
-- Por qué una función y no una consulta desde la app: el feed es "posts
-- cuyo autor soy yo o alguien a quien sigo". Desde la app habría que pedir
-- primero la lista de seguidos y luego mandarla entera en la URL
-- (author_id=in.(...)); con cientos de seguidos la URL se hace enorme. Aquí
-- la base de datos resuelve el "a quién sigo" ella sola, en una consulta.
--
-- security invoker: se ejecuta con los permisos de quien llama, así que las
-- políticas RLS de posts y follows se siguen aplicando. No abre nada nuevo.
--
-- Paginación por cursor (keyset), no por offset: la app pasa la fecha y el
-- id del último post que tiene y recibe los siguientes. Con offset, si
-- alguien publica mientras haces scroll, todo se desplaza una posición y
-- verías posts repetidos. El id desempata posts con la misma fecha exacta.
-- =====================================================================

begin;

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
  limit least(greatest(page_size, 1), 50);  -- nadie pide 10 000 filas de golpe
$$;

-- Por defecto Postgres deja ejecutar funciones a todo el mundo (PUBLIC).
-- Solo usuarios con sesión.
revoke execute on function public.feed(timestamptz, uuid, integer) from public, anon;
grant execute on function public.feed(timestamptz, uuid, integer) to authenticated;

commit;
