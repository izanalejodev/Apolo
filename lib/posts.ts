import { PickedImage, prepareImage, removeFile, uploadImage } from './media';
import { PROFILE_SUMMARY_COLUMNS, ProfileSummary } from './profile';
import { supabase } from './supabase';

// Fila de public.posts
export type Post = {
  id: string;
  author_id: string;
  caption: string | null;
  media_path: string;
  media_type: 'image' | 'video';
  duration_seconds: number | null;
  tags: string[];
  created_at: string;
};

export const CAPTION_MAX = 2200; // mismo límite que el CHECK de la tabla
const POST_IMAGE_MAX_SIDE = 1440;

// Publicar = subir el archivo y después crear la fila que apunta a él.
// Son dos pasos que no pueden ir en una transacción (Storage no es Postgres),
// así que si falla el segundo borramos el archivo para no dejar basura.
export async function createImagePost(userId: string, image: PickedImage, caption: string) {
  const uri = await prepareImage(image, POST_IMAGE_MAX_SIDE);
  const path = await uploadImage('posts', userId, uri);

  const { error } = await supabase.from('posts').insert({
    author_id: userId,
    media_path: path,
    media_type: 'image',
    caption: caption.trim() || null,
  });

  if (error) {
    await removeFile('posts', path).catch(() => {});
    throw error;
  }
}

// Más recientes primero. El límite evita descargar cientos de filas de golpe;
// cuando alguien llegue a 60 publicaciones tocará paginar (scroll infinito).
export async function fetchUserPosts(userId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .limit(60)
    .returns<Post[]>();
  if (error) throw error;
  return data;
}

// Post del feed: la fila más los datos del autor para la cabecera
export type FeedPost = Post & { author: ProfileSummary };

// Dónde se quedó la página anterior (ver supabase/migrations/002_feed.sql)
export type FeedCursor = { created_at: string; id: string };

export const FEED_PAGE_SIZE = 20;

// Feed cronológico: mis posts y los de quien sigo. La lógica de "quién sigo"
// vive en la función feed() de la BD. Sobre su resultado se puede encadenar
// .select() como si fuera una tabla, y así traemos el autor en la misma
// petición (sin esto serían 20 peticiones más, una por post).
export async function fetchFeed(cursor: FeedCursor | null) {
  const { data, error } = await supabase
    .rpc('feed', {
      before_created_at: cursor?.created_at ?? null,
      before_id: cursor?.id ?? null,
      page_size: FEED_PAGE_SIZE,
    })
    .select(`*, author:profiles(${PROFILE_SUMMARY_COLUMNS})`);
  if (error) throw error;
  // Sin tipos generados del esquema, supabase-js no sabe que feed() devuelve
  // una lista de posts, así que se lo decimos nosotros.
  return (data ?? []) as unknown as FeedPost[];
}

// "hace 5 min", "hace 3 h", "hace 2 d" y, a partir de una semana, la fecha
export function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'ahora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Primero la fila (lo que ve la gente) y luego el archivo. Si fallara el
// segundo paso queda un archivo huérfano, que no se ve; al revés quedaría una
// publicación con la imagen rota.
export async function deletePost(post: Post) {
  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw error;
  await removeFile('posts', post.media_path).catch(() => {});
}
