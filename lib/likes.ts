import { useRef } from 'react';
import { showAlert } from './alert';
import { patchPostStats, usePostStats } from './postStats';
import type { FeedPost } from './posts';
import { ProfileSummary } from './profile';
import { supabase } from './supabase';

// Un like = una fila (user_id, post_id) en likes. Igual que follows: la PK
// impide dar like dos veces y RLS solo deja crear/borrar las filas propias.

export async function like(me: string, postId: string) {
  const { error } = await supabase.from('likes').insert({ user_id: me, post_id: postId });
  // 23505 = ya existía (doble toque, otro móvil): el resultado es el que se quería
  if (error && error.code !== '23505') throw error;
}

export async function unlike(me: string, postId: string) {
  const { error } = await supabase.from('likes').delete().eq('user_id', me).eq('post_id', postId);
  if (error) throw error;
}

// Corazón de un post, con actualización optimista (como el botón Seguir):
// cambia al instante y, si la BD falla, vuelve atrás.
//
// El estado no vive aquí sino en lib/postStats.ts, compartido por toda la
// app: así un like dado en el detalle ya sale en el feed al volver.
export function useLike(me: string | undefined, post: FeedPost) {
  const stats = usePostStats(post);
  const busy = useRef(false);

  async function toggle() {
    if (!me || busy.current) return; // busy: un toque a la vez
    const next = !stats.liked;
    const apply = (on: boolean) =>
      patchPostStats(post.id, (s) => ({ ...s, liked: on, likeCount: Math.max(0, s.likeCount + (on ? 1 : -1)) }));
    busy.current = true;
    apply(next);
    try {
      await (next ? like(me, post.id) : unlike(me, post.id));
    } catch (e: any) {
      apply(!next);
      showAlert('No se pudo guardar el me gusta', e.message);
    } finally {
      busy.current = false;
    }
  }

  return { liked: stats.liked, count: stats.likeCount, toggle };
}

// Quién ha dado like, más recientes primero (función post_likers, migración
// 008: quita las cuentas bloqueadas)
export type Liker = ProfileSummary & { liked_at: string };
export const LIKERS_PAGE_SIZE = 30;

export async function fetchLikers(postId: string, last: Liker | null) {
  const { data, error } = await supabase.rpc('post_likers', {
    target_post: postId,
    before_created_at: last?.liked_at ?? null,
    before_user: last?.id ?? null,
    page_size: LIKERS_PAGE_SIZE,
  });
  if (error) throw error;
  return (data ?? []) as Liker[];
}
