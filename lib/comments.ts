import { PROFILE_SUMMARY_COLUMNS, ProfileSummary } from './profile';
import { supabase } from './supabase';

// Fila de public.comments con el autor ya unido
export type Comment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: ProfileSummary;
};

export const COMMENT_MAX = 500; // mismo límite que el CHECK de la tabla
export const COMMENTS_PAGE_SIZE = 30;

// !author_id: misma pista que en posts.ts, por si algún día hay otro camino
const COMMENT_COLUMNS = `id, post_id, author_id, body, created_at, author:profiles!author_id(${PROFILE_SUMMARY_COLUMNS})`;

// Más nuevos primero, paginando por (created_at, id) igual que el feed.
// El "or" es la forma de PostgREST de escribir
//   created_at < X  OR  (created_at = X AND id < Y)
// que es lo mismo que (created_at, id) < (X, Y) en SQL.
export async function fetchComments(postId: string, last: Comment | null) {
  let query = supabase
    .from('comments')
    .select(COMMENT_COLUMNS)
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(COMMENTS_PAGE_SIZE);
  if (last) {
    query = query.or(
      `created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`
    );
  }
  const { data, error } = await query.returns<Comment[]>();
  if (error) throw error;
  return data;
}

// Devuelve el comentario creado (con su id y fecha reales, que pone la BD)
// para pintarlo sin volver a pedir la lista
export async function addComment(me: string, postId: string, body: string) {
  const { data, error } = await supabase
    .from('comments')
    .insert({ author_id: me, post_id: postId, body: body.trim() })
    .select(COMMENT_COLUMNS)
    .single<Comment>();
  if (error) throw error;
  return data;
}

// RLS decide si puedo: solo el autor del comentario o el dueño del post.
// Si no puedo, delete no da error, simplemente no borra nada; por eso se
// pide la fila borrada y se comprueba que haya una.
export async function deleteComment(id: string) {
  const { data, error } = await supabase.from('comments').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('No tienes permiso para borrar este comentario');
}
