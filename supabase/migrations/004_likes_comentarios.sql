-- =====================================================================
-- 004: contadores de likes y comentarios y "¿le he dado like?"
--
-- Las tablas likes y comments ya existen (con RLS y grants, ver 001). Lo
-- que falta es que cada post llegue a la app con:
--   · like_count     cuántos likes tiene
--   · comment_count  cuántos comentarios tiene
--   · liked_by_me    si yo le he dado like
--
-- Cómo: "campos calculados" de PostgREST. Una función que recibe una fila
-- de posts (public.posts como tipo) aparece en la API como si fuera una
-- columna más del post, y se pide en el select igual que las demás:
--     .select('*, like_count, comment_count, liked_by_me')
-- Funciona también sobre el resultado de feed() y explore_posts(), porque
-- devuelven filas de posts. Así el feed sigue siendo UNA petición.
--
-- Por qué no guardar los contadores en posts (regla del proyecto): un
-- contador guardado hay que mantenerlo con triggers, y se desincroniza en
-- cuanto algo falla. count(*) sobre el índice likes_post_idx /
-- comments_post_created_idx es barato con 20 posts por página. Si algún día
-- hay posts con 100 000 likes, se revisa.
--
-- security invoker: cuentan con los permisos de quien llama (RLS aplica).
-- =====================================================================

begin;

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

-- Usa la PK (user_id, post_id): una búsqueda directa, no un recorrido
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

-- Los comentarios se listan del más nuevo al más antiguo, paginando por
-- (created_at, id) como el feed. El índice de 001 es (post_id, created_at);
-- con el id al final la paginación usa el índice entero.
drop index if exists public.comments_post_created_idx;
create index comments_post_created_idx on public.comments (post_id, created_at desc, id desc);

revoke execute on function public.like_count(public.posts)    from public, anon;
revoke execute on function public.comment_count(public.posts) from public, anon;
revoke execute on function public.liked_by_me(public.posts)   from public, anon;
grant execute on function public.like_count(public.posts)    to authenticated;
grant execute on function public.comment_count(public.posts) to authenticated;
grant execute on function public.liked_by_me(public.posts)   to authenticated;

commit;

-- Comprobación (en el SQL Editor no hay sesión, así que liked_by_me sale
-- false; lo que importa es que las tres columnas existan y no den error):
--   select p.id, public.like_count(p), public.comment_count(p), public.liked_by_me(p)
--   from public.posts p limit 5;
