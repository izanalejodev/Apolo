-- =====================================================================
-- 006: bloqueos y denuncias
--
-- Apple y Google exigen, en apps con contenido de usuarios:
--   1. poder DENUNCIAR contenido ofensivo,
--   2. poder BLOQUEAR a usuarios abusivos,
--   3. que el desarrollador actúe sobre las denuncias (Apple dice 24 h).
--
-- BLOQUEAR (tabla blocks). Si A bloquea a B, en los dos sentidos:
--   · no se ven las publicaciones ni los comentarios del otro,
--   · no se pueden seguir (y al bloquear se borran los follows que hubiera),
--   · no se pueden escribir mensajes, ni comentar ni dar like al otro,
--   · no salen en la búsqueda de personas.
-- El perfil sí se puede abrir (si no, no habría forma de desbloquear desde
-- ahí) y el historial del chat se conserva, pero sin poder escribir.
-- Es en los dos sentidos porque si solo B dejara de ver a A, B podría
-- seguir escribiendo a A, que es justo lo que A quería evitar.
--
-- DENUNCIAR (tabla reports). La app no lee ni escribe la tabla: denuncia
-- con report_content(), que averigua ella misma de quién es el contenido
-- (si lo mandara la app, se podría denunciar a cualquiera en nombre de
-- cualquier contenido) y guarda una COPIA del contenido: si el denunciado
-- lo borra después, la prueba sigue ahí. Las denuncias se revisan en el
-- panel de Supabase (Table Editor), que se salta RLS.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- BLOCKS
-- ---------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- Para el borrado en cascada al borrar un perfil (la PK no empieza por blocked_id)
create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;

-- Solo veo a quién he bloqueado yo; NO quién me ha bloqueado a mí
create policy blocks_select on public.blocks
  for select to authenticated using ((select auth.uid()) = blocker_id);
create policy blocks_delete on public.blocks
  for delete to authenticated using ((select auth.uid()) = blocker_id);

-- Bloquear solo con block_user() (borra también los follows, ver abajo)
revoke insert, update on public.blocks from authenticated, anon;


-- ¿Hay un bloqueo entre la otra persona y yo, en cualquier sentido?
-- security definer: tiene que ver también los bloqueos que me han hecho a
-- mí, que blocks_select no me deja leer. Solo devuelve sí/no. (Que alguien
-- te ha bloqueado se acaba notando igual, porque dejas de ver sus cosas;
-- pasa en todas las redes.) Cada mitad del "or" es una búsqueda por la PK.
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

-- ¿Hay alguien en esta conversación con quien tenga un bloqueo?
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

-- Bloquear: el bloqueo y borrar los follows en los dos sentidos, de una.
-- security definer porque RLS no me deja borrar el follow que el OTRO
-- tiene hacia mí (follows_delete: solo el follower borra el suyo).
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


-- ---------------------------------------------------------------------
-- LOS BLOQUEOS EN EL RESTO DE TABLAS
-- alter policy cambia solo la condición; el resto de la política se queda.
-- ---------------------------------------------------------------------

-- No veo publicaciones ni comentarios de alguien con quien hay bloqueo.
-- (Esto también afecta al feed, a explorar y a comment_count, que pasan
-- por estas políticas: no hay que tocarlos.)
alter policy posts_select on public.posts
  using (not public.is_blocked_with(author_id));

alter policy comments_select on public.comments
  using (not public.is_blocked_with(author_id));

alter policy follows_insert on public.follows
  with check (
    (select auth.uid()) = follower_id
    and not public.is_blocked_with(followed_id)
  );

-- Comentar o dar like: no si hay bloqueo con el autor del post
alter policy comments_insert on public.comments
  with check (
    (select auth.uid()) = author_id
    and not public.is_blocked_with((select p.author_id from public.posts p where p.id = post_id))
  );

alter policy likes_insert on public.likes
  with check (
    (select auth.uid()) = user_id
    and not public.is_blocked_with((select p.author_id from public.posts p where p.id = post_id))
  );

alter policy messages_insert on public.messages
  with check (
    (select auth.uid()) = sender_id
    and public.is_conversation_member(conversation_id)
    and not public.conversation_blocked(conversation_id)
  );

-- Abrir chat con alguien: tampoco si hay bloqueo (mismo cuerpo que en 005
-- más la comprobación nueva)
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

-- Búsqueda de personas: mismo cuerpo que en 003 más el filtro de bloqueos
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


-- ---------------------------------------------------------------------
-- REPORTS
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


-- ---------------------------------------------------------------------
-- PERMISOS DE LAS FUNCIONES
-- ---------------------------------------------------------------------
revoke execute on function public.is_blocked_with(uuid)       from public, anon;
revoke execute on function public.conversation_blocked(uuid)  from public, anon;
revoke execute on function public.block_user(uuid)            from public, anon;
revoke execute on function public.report_content(public.report_target_kind, uuid, public.report_reason, text) from public, anon;
grant execute on function public.is_blocked_with(uuid)       to authenticated;
grant execute on function public.conversation_blocked(uuid)  to authenticated;
grant execute on function public.block_user(uuid)            to authenticated;
grant execute on function public.report_content(public.report_target_kind, uuid, public.report_reason, text) to authenticated;

commit;

-- Comprobaciones:
--   select * from public.reports order by created_at desc;
--   select policyname, qual, with_check from pg_policies
--   where tablename in ('posts', 'comments', 'follows', 'likes', 'messages');
