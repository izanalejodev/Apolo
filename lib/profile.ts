import { supabase } from './supabase';

// Fila de public.profiles tal como la devuelve Supabase
export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  city: string | null;
  disciplines: string[];
  styles: string[];
  availability: string | null;
  services_text: string | null;
  contact_link: string | null;
  created_at: string;
};

// Campos que el usuario puede editar. Debe coincidir con el
// "grant update (...)" de supabase/schema.sql.
export type ProfileUpdate = Pick<
  Profile,
  | 'display_name'
  | 'bio'
  | 'city'
  | 'disciplines'
  | 'styles'
  | 'availability'
  | 'services_text'
  | 'contact_link'
>;

// Lista cerrada de disciplinas. La clave (sin tildes ni mayúsculas) es lo que
// se guarda; la etiqueta es lo que se ve. Si añades una, añádela también al
// CHECK profiles_disciplines_validas de supabase/schema.sql.
export const DISCIPLINES = [
  { key: 'baile', label: 'Baile' },
  { key: 'canto', label: 'Canto' },
  { key: 'musica', label: 'Música' },
  { key: 'dj', label: 'DJ' },
  { key: 'fotografia', label: 'Fotografía' },
  { key: 'video', label: 'Vídeo' },
  { key: 'actuacion', label: 'Actuación' },
  { key: 'artes_visuales', label: 'Artes visuales' },
] as const;

export const MAX_DISCIPLINES = 5;
export const MAX_STYLES = 15;

// Mismos límites que los CHECK de la tabla
export const LIMITS = {
  display_name: 50,
  bio: 300,
  city: 80,
  availability: 200,
  services_text: 1000,
  contact_link: 300,
} as const;

export function disciplineLabel(key: string) {
  return DISCIPLINES.find((d) => d.key === key)?.label ?? key;
}

// "Hip Hop, popping ,  hip hop" -> ["hip hop", "popping"]
export function parseStyles(text: string) {
  const list = text
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((s) => s.length > 0);
  return [...new Set(list)];
}

// "instagram.com/izan" -> "https://instagram.com/izan"; "" -> null
export function normalizeLink(text: string) {
  const t = text.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

// Texto vacío -> null, para no guardar "" en la base de datos
export function emptyToNull(text: string) {
  const t = text.trim();
  return t ? t : null;
}

export async function fetchProfile(id: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single<Profile>();
  if (error) throw error;
  return data;
}

export async function updateProfile(id: string, changes: ProfileUpdate) {
  const { error } = await supabase.from('profiles').update(changes).eq('id', id);
  if (error) throw error;
}

// Contadores calculados al vuelo (regla del proyecto: no se guardan).
// head: true -> no descarga filas, solo pide el número.
export async function fetchProfileCounts(id: string) {
  const [followers, following, posts] = await Promise.all([
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id),
    supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('author_id', id),
  ]);
  return {
    followers: followers.count ?? 0,
    following: following.count ?? 0,
    posts: posts.count ?? 0,
  };
}
