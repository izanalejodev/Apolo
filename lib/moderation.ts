import { PROFILE_SUMMARY_COLUMNS, ProfileSummary } from './profile';
import { supabase } from './supabase';

// Bloquear y denunciar (migración 006). Lo importante (qué deja de verse,
// quién no puede escribir a quién) lo decide la base de datos; aquí solo
// están las llamadas.

// Valores de los enums report_target_kind y report_reason
export type ReportKind = 'post' | 'comment' | 'message' | 'profile';
export type ReportReason = 'spam' | 'harassment' | 'hate' | 'nudity' | 'violence' | 'impersonation' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'spam', label: 'Spam o estafa' },
  { key: 'harassment', label: 'Acoso o intimidación' },
  { key: 'hate', label: 'Discurso de odio' },
  { key: 'nudity', label: 'Desnudos o contenido sexual' },
  { key: 'violence', label: 'Violencia o amenazas' },
  { key: 'impersonation', label: 'Se hace pasar por otra persona' },
  { key: 'other', label: 'Otro motivo' },
];

export const REPORT_DETAILS_MAX = 1000; // mismo límite que el CHECK

export const REPORT_KIND_LABEL: Record<ReportKind, string> = {
  post: 'publicación',
  comment: 'comentario',
  message: 'mensaje',
  profile: 'perfil',
};

// La BD averigua de quién es el contenido y guarda una copia. Denunciar dos
// veces lo mismo no da error (simplemente no se duplica).
export async function reportContent(kind: ReportKind, targetId: string, reason: ReportReason, details: string) {
  const { error } = await supabase.rpc('report_content', {
    p_kind: kind,
    p_target: targetId,
    p_reason: reason,
    p_details: details.trim() || null,
  });
  if (error) throw error;
}

// Bloquear también deja de seguir en los dos sentidos (lo hace la función)
export async function blockUser(userId: string) {
  const { error } = await supabase.rpc('block_user', { target: userId });
  if (error) throw error;
}

export async function unblockUser(me: string, userId: string) {
  const { error } = await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', userId);
  if (error) throw error;
}

// ¿Lo he bloqueado YO? (Si me ha bloqueado él, no se puede saber desde
// aquí, a propósito: blocks solo me deja ver mis propios bloqueos.)
export async function isBlockedByMe(me: string, userId: string) {
  const { count, error } = await supabase
    .from('blocks')
    .select('*', { count: 'exact', head: true })
    .eq('blocker_id', me)
    .eq('blocked_id', userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

// Mis cuentas bloqueadas (la búsqueda ya no las enseña, así que hace falta
// esta lista para poder desbloquearlas)
export async function fetchBlockedUsers(me: string) {
  const { data, error } = await supabase
    .from('blocks')
    .select(`profile:profiles!blocked_id(${PROFILE_SUMMARY_COLUMNS})`)
    .eq('blocker_id', me)
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<{ profile: ProfileSummary }[]>();
  if (error) throw error;
  return data.map((row) => row.profile);
}

// 42501 = RLS rechazó la fila. En un chat casi siempre es por un bloqueo;
// el mensaje técnico ("violates row-level security policy") no dice nada
// al usuario.
export function isRlsError(e: any) {
  return e?.code === '42501';
}
