-- =====================================================================
-- 005: chat (mensajes directos 1 a 1)
--
-- Tres tablas:
--   · conversations         una conversación
--   · conversation_members  quién está en cada una (y hasta dónde ha leído)
--   · messages              los mensajes
--
-- Por qué tabla de miembros y no "user_a, user_b" en conversations: así
-- el día que haya grupos (un casting, una compañía) no hay que rehacer
-- nada. En V1 solo hay conversaciones de dos (dm_key no nulo).
--
-- Quién crea las conversaciones: NADIE desde la app directamente. Crear
-- una conversación son dos pasos (la fila y sus dos miembros) y el
-- segundo incluye meter a OTRA persona, cosa que RLS no puede permitir
-- sin abrir la puerta a meter a cualquiera en cualquier sitio. Por eso lo
-- hace la función get_or_create_dm(), que comprueba todo y lo hace de una.
--
-- Tiempo real: messages se añade a la publicación supabase_realtime. La
-- app se suscribe a los INSERT y Realtime solo le manda los mensajes que
-- RLS le dejaría leer (los de sus conversaciones).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- TABLAS
-- ---------------------------------------------------------------------
create table public.conversations (
  id         uuid primary key default gen_random_uuid(),
  -- "uuidMenor:uuidMayor" en las de dos personas; null en grupos (futuro).
  -- unique: entre dos personas hay UNA conversación aunque los dos le den
  -- a "Mensaje" a la vez (ver get_or_create_dm).
  dm_key     text unique,
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  -- Mensajes posteriores a esto (y que no son míos) = no leídos.
  -- Es una fecha y no un contador: nada que mantener sincronizado.
  last_read_at    timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- La PK cubre "miembros de esta conversación"; este, "mis conversaciones"
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (char_length(trim(body)) between 1 and 2000),
  created_at      timestamptz not null default now()
);

-- Mensajes de una conversación, más nuevos primero, paginando por
-- (created_at, id). También sirve para sacar "el último mensaje".
create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc, id desc);


-- ---------------------------------------------------------------------
-- ¿SOY MIEMBRO? (función auxiliar para las políticas)
--
-- security definer: se salta RLS al leer conversation_members. Hace falta
-- porque la política de conversation_members necesita preguntar "¿soy
-- miembro?" consultando... conversation_members. Si la consulta pasara por
-- RLS, la política se llamaría a sí misma sin fin (Postgres da el error
-- "infinite recursion detected in policy"). Solo devuelve sí/no sobre mí,
-- así que no filtra nada que no deba.
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

create policy conversations_select on public.conversations
  for select to authenticated
  using (public.is_conversation_member(id));

-- Veo todos los miembros de mis conversaciones (también al otro: hace
-- falta para saber con quién hablo)
create policy conversation_members_select on public.conversation_members
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- Solo puedo tocar MI fila (y el grant de abajo dice: solo last_read_at)
create policy conversation_members_update on public.conversation_members
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy messages_select on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- Escribo como yo y solo en conversaciones donde estoy
create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    (select auth.uid()) = sender_id
    and public.is_conversation_member(conversation_id)
  );

-- Sin políticas de delete ni de update en mensajes: en V1 no se editan ni
-- se borran (se puede añadir luego, con cuidado de cómo se ve en el otro).

revoke insert, update, delete on public.conversations        from authenticated, anon;
revoke insert, update, delete on public.conversation_members from authenticated, anon;
revoke insert, update, delete on public.messages             from authenticated, anon;
grant update (last_read_at) on public.conversation_members to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;


-- ---------------------------------------------------------------------
-- ABRIR (O CREAR) LA CONVERSACIÓN CON ALGUIEN
--
-- Devuelve el id de la conversación entre yo y other_user; si no existe,
-- la crea con los dos miembros. security definer porque inserta filas que
-- RLS no deja insertar desde la app (ver cabecera); por eso comprueba a
-- mano todo lo que importa: que hay sesión, que no soy yo y que existe.
--
-- Si los dos la crean a la vez: el segundo insert choca con el unique de
-- dm_key, "on conflict do nothing" no inserta nada, y entonces se busca la
-- que creó el otro. Nunca quedan dos conversaciones entre las mismas personas.
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- MARCAR COMO LEÍDA
-- Una función para que la hora la ponga el servidor (now()) y no el reloj
-- del móvil, que puede ir mal. security invoker: pasa por la política
-- conversation_members_update, así que solo toca mi fila.
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- MIS CONVERSACIONES (la bandeja de entrada)
--
-- Una fila por conversación con: la otra persona, el último mensaje y si
-- hay algo sin leer. Ordenadas por el último mensaje, con cursor
-- (last_at, conversation_id) como el feed.
--
-- Las conversaciones sin mensajes no salen (el "cross join lateral" no
-- devuelve nada si no hay último mensaje): si abres un chat y te vas sin
-- escribir, no aparece en la bandeja de ninguno de los dos.
--
-- Sin columna "last_message_at" guardada en conversations: el último
-- mensaje se saca con el índice messages_conversation_created_idx (una
-- búsqueda directa por conversación), así no hay nada que mantener.
-- ---------------------------------------------------------------------
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


-- ---------------------------------------------------------------------
-- PERMISOS DE LAS FUNCIONES
-- is_conversation_member tiene que poder ejecutarla authenticated: las
-- políticas se evalúan con los permisos de quien hace la consulta.
-- ---------------------------------------------------------------------
revoke execute on function public.is_conversation_member(uuid)                  from public, anon;
revoke execute on function public.get_or_create_dm(uuid)                        from public, anon;
revoke execute on function public.mark_conversation_read(uuid)                  from public, anon;
revoke execute on function public.my_conversations(timestamptz, uuid, integer)  from public, anon;
grant execute on function public.is_conversation_member(uuid)                  to authenticated;
grant execute on function public.get_or_create_dm(uuid)                        to authenticated;
grant execute on function public.mark_conversation_read(uuid)                  to authenticated;
grant execute on function public.my_conversations(timestamptz, uuid, integer)  to authenticated;


-- ---------------------------------------------------------------------
-- TIEMPO REAL
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;

commit;

-- Comprobaciones (en el SQL Editor no hay sesión: las funciones que usan
-- auth.uid() no devuelven nada ahí; lo importante es que no den error):
--   select * from public.my_conversations();
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
