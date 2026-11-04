import { useEffect, useRef, useState } from 'react';
import { showAlert } from './alert';
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

type LikeState = { liked: boolean; count: number };

// Estado del corazón de un post, con actualización optimista (como el botón
// Seguir): cambia al instante y, si la BD falla, vuelve atrás.
//
// Parte de lo que trajo el servidor (initial). Si llega un dato nuevo del
// servidor (al refrescar el feed) se usa ese; mientras no, manda lo local.
export function useLike(me: string | undefined, postId: string, initial: LikeState) {
  const [state, setState] = useState(initial);
  const busy = useRef(false);

  useEffect(() => {
    setState(initial);
  }, [postId, initial.liked, initial.count]);

  async function toggle() {
    if (!me || busy.current) return; // busy: un toque a la vez
    const next = !state.liked;
    busy.current = true;
    setState((s) => ({ liked: next, count: s.count + (next ? 1 : -1) }));
    try {
      await (next ? like(me, postId) : unlike(me, postId));
    } catch (e: any) {
      setState((s) => ({ liked: !next, count: s.count + (next ? -1 : 1) }));
      showAlert('No se pudo guardar el me gusta', e.message);
    } finally {
      busy.current = false;
    }
  }

  return { ...state, toggle };
}
