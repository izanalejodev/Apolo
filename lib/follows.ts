import { ProfileSummary } from './profile';
import { supabase } from './supabase';

// Seguir es unidireccional: una fila (follower_id -> followed_id) en follows.
// La BD impide seguir dos veces (PK) y seguirse a uno mismo (CHECK), y RLS
// solo deja crear/borrar filas donde follower_id soy yo.

export async function isFollowing(me: string, other: string) {
  const { count, error } = await supabase
    .from('follows')
    .select('*', { count: 'exact', head: true })
    .eq('follower_id', me)
    .eq('followed_id', other);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function follow(me: string, other: string) {
  const { error } = await supabase.from('follows').insert({ follower_id: me, followed_id: other });
  // 23505 = clave duplicada: ya lo seguía (p. ej. doble toque o dos móviles).
  // El resultado que quería el usuario ya se cumple, así que no es un error.
  if (error && error.code !== '23505') throw error;
}

export async function unfollow(me: string, other: string) {
  // Si la fila no existe, delete no falla: dejar de seguir es idempotente
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', me)
    .eq('followed_id', other);
  if (error) throw error;
}

export type FollowListKind = 'followers' | 'following';

// Seguidores de userId, o a quién sigue userId.
// follows tiene DOS claves foráneas hacia profiles (follower_id y
// followed_id), así que hay que decirle a Supabase por cuál unir:
// "profiles!follower_id" = el perfil apuntado por la columna follower_id.
export async function fetchFollowList(userId: string, kind: FollowListKind) {
  const query =
    kind === 'followers'
      ? supabase
          .from('follows')
          .select('profile:profiles!follower_id(id, username, display_name, avatar_path)')
          .eq('followed_id', userId)
      : supabase
          .from('follows')
          .select('profile:profiles!followed_id(id, username, display_name, avatar_path)')
          .eq('follower_id', userId);

  // Límite provisional, como en la cuadrícula de posts: paginar cuando haga falta
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<{ profile: ProfileSummary }[]>();
  if (error) throw error;
  return data.map((row) => row.profile);
}
