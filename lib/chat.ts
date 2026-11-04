import { PROFILE_SUMMARY_COLUMNS, ProfileSummary } from './profile';
import { supabase } from './supabase';

// Fila de public.messages. Sin el perfil del autor unido: en un chat de
// dos ya sé quién es cada uno (yo o la otra persona), y lo que llega por
// Realtime es la fila tal cual, sin joins.
export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

// Una fila de la bandeja de entrada (función my_conversations, migración 005)
export type ConversationSummary = {
  id: string;
  other: ProfileSummary;
  last_body: string;
  last_sender_id: string;
  last_at: string;
  unread: boolean;
};

export const MESSAGE_MAX = 2000; // mismo límite que el CHECK de la tabla
export const MESSAGES_PAGE_SIZE = 40;
export const CONVERSATIONS_PAGE_SIZE = 30;

const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, body, created_at';

// Devuelve el id de la conversación con esa persona (la crea si no existe).
// Lo hace la BD porque meter a OTRA persona en una conversación no se puede
// permitir con RLS desde la app (ver la cabecera de la migración 005).
export async function openDm(otherUserId: string) {
  const { data, error } = await supabase.rpc('get_or_create_dm', { other_user: otherUserId });
  if (error) throw error;
  return data as string;
}

type ConversationRow = {
  conversation_id: string;
  other_id: string;
  other_username: string;
  other_display_name: string | null;
  other_avatar_path: string | null;
  last_body: string;
  last_sender_id: string;
  last_at: string;
  unread: boolean;
};

export async function fetchConversations(last: ConversationSummary | null) {
  const { data, error } = await supabase.rpc('my_conversations', {
    before_last_at: last?.last_at ?? null,
    before_id: last?.id ?? null,
    page_size: CONVERSATIONS_PAGE_SIZE,
  });
  if (error) throw error;
  // La función devuelve columnas planas (other_username...); aquí se
  // agrupan como un ProfileSummary para poder usar Avatar y compañía
  return ((data ?? []) as ConversationRow[]).map(
    (r): ConversationSummary => ({
      id: r.conversation_id,
      other: {
        id: r.other_id,
        username: r.other_username,
        display_name: r.other_display_name,
        avatar_path: r.other_avatar_path,
      },
      last_body: r.last_body,
      last_sender_id: r.last_sender_id,
      last_at: r.last_at,
      unread: r.unread,
    })
  );
}

// Con quién hablo en esta conversación (para la cabecera del chat).
// RLS solo me deja ver los miembros si yo también lo soy, así que si
// alguien abre el chat de otros con un id inventado, sale null.
export async function fetchPeer(conversationId: string, me: string) {
  const { data, error } = await supabase
    .from('conversation_members')
    .select(`profile:profiles!user_id(${PROFILE_SUMMARY_COLUMNS})`)
    .eq('conversation_id', conversationId)
    .neq('user_id', me)
    .limit(1)
    .maybeSingle<{ profile: ProfileSummary }>();
  if (error) throw error;
  return data?.profile ?? null;
}

// Más nuevos primero (la lista del chat va invertida: el más nuevo queda
// abajo). Misma paginación por (created_at, id) que los comentarios.
export async function fetchMessages(conversationId: string, last: Message | null) {
  let query = supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);
  if (last) {
    query = query.or(
      `created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`
    );
  }
  const { data, error } = await query.returns<Message[]>();
  if (error) throw error;
  return data;
}

export async function sendMessage(me: string, conversationId: string, body: string) {
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: me, conversation_id: conversationId, body: body.trim() })
    .select(MESSAGE_COLUMNS)
    .single<Message>();
  if (error) throw error;
  return data;
}

export async function markRead(conversationId: string) {
  const { error } = await supabase.rpc('mark_conversation_read', { conv: conversationId });
  if (error) throw error;
  readListeners.forEach((l) => l());
}

// Avisa cuando marco algo como leído (lo usa el globo de no leídos de la
// pestaña, lib/unread.ts). Devuelve la función para darse de baja.
const readListeners = new Set<() => void>();
export function onReadChange(listener: () => void) {
  readListeners.add(listener);
  return () => {
    readListeners.delete(listener);
  };
}

// Mete mensajes nuevos en la lista (más nuevo primero) sin duplicados. Un
// mismo mensaje puede llegar dos veces: el mío vuelve del insert Y por
// Realtime; y uno ajeno, por Realtime Y en una recarga.
export function mergeMessages(list: Message[], incoming: Message[]) {
  const seen = new Set(list.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  if (fresh.length === 0) return list;
  return [...fresh, ...list].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1
  );
}

// Avisa de cada mensaje nuevo. Con conversationId, solo los de esa
// conversación; sin él, todos los míos (para la bandeja). No hace falta
// filtrar "los míos": Realtime aplica RLS y solo manda lo que puedo leer.
//
// onSubscribed se llama cada vez que la conexión queda lista, también al
// reconectar (p. ej. tras perder la red o volver de segundo plano): es el
// momento de recargar, porque lo que llegó mientras no había conexión no
// se va a recibir por aquí.
//
// Devuelve la función para darse de baja (para el return de un useEffect).
export function subscribeToMessages(
  conversationId: string | null,
  onInsert: (m: Message) => void,
  onSubscribed?: () => void
) {
  // Nombre único: si dos pantallas usaran el mismo, compartirían canal y al
  // cerrar una se cortaría la otra
  const name = `messages:${conversationId ?? 'inbox'}:${Math.random().toString(36).slice(2)}`;
  const channel = supabase
    .channel(name)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}),
      },
      (payload) => onInsert(payload.new as Message)
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onSubscribed?.();
    });
  return () => {
    supabase.removeChannel(channel);
  };
}

// Hora de un mensaje: "18:42" si es de hoy; si no, "3 nov, 18:42"
export function messageTime(iso: string) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}, ${time}`;
}
