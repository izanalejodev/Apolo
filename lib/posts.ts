import { PickedImage, prepareImage, removeFile, uploadImage } from './media';
import { primePostStats } from './postStats';
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
  // Tamaño de la foto (migración 008). null en publicaciones anteriores
  width: number | null;
  height: number | null;
  created_at: string;
};

export const CAPTION_MAX = 2200; // mismo límite que el CHECK de la tabla
const POST_IMAGE_MAX_SIDE = 1440;

// Publicar = subir el archivo y después crear la fila que apunta a él.
// Son dos pasos que no pueden ir en una transacción (Storage no es Postgres),
// así que si falla el segundo borramos el archivo para no dejar basura.
export async function createImagePost(userId: string, image: PickedImage, caption: string) {
  const prepared = await prepareImage(image, POST_IMAGE_MAX_SIDE);
  const path = await uploadImage('posts', userId, prepared.uri);

  // El tamaño se guarda para que el feed sepa la proporción antes de
  // descargar la foto (si no, tendría que recortarla o "saltar" al cargar)
  const sized = prepared.width > 0 && prepared.height > 0;
  const { error } = await supabase.from('posts').insert({
    author_id: userId,
    media_path: path,
    media_type: 'image',
    caption: caption.trim() || null,
    width: sized ? Math.round(prepared.width) : null,
    height: sized ? Math.round(prepared.height) : null,
  });

  if (error) {
    await removeFile('posts', path).catch(() => {});
    throw error;
  }
}

// Cuadrícula de un perfil: más recientes primero, de 30 en 30 (múltiplo de
// 3, para que cada página llene filas enteras). Misma paginación por
// (created_at, id) que los comentarios.
export const USER_POSTS_PAGE_SIZE = 30;

export async function fetchUserPosts(userId: string, last: Post | null) {
  let query = supabase
    .from('posts')
    .select('*')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(USER_POSTS_PAGE_SIZE);
  if (last) {
    query = query.or(
      `created_at.lt.${last.created_at},and(created_at.eq.${last.created_at},id.lt.${last.id})`
    );
  }
  const { data, error } = await query.returns<Post[]>();
  if (error) throw error;
  return data;
}

// Proporción con la que se pinta la foto en el feed. Se limita como hace
// Instagram (entre 4:5 vertical y 1,91:1 horizontal): una foto muy alta
// ocuparía varias pantallas. Lo que sobre se recorta un poco.
export function feedAspectRatio(post: Pick<Post, 'width' | 'height'>) {
  if (!post.width || !post.height) return 1;
  return Math.min(1.91, Math.max(0.8, post.width / post.height));
}

// Post del feed (y del detalle): la fila, el autor para la cabecera y los
// contadores. like_count, comment_count y liked_by_me no son columnas de
// verdad sino funciones de la BD (migración 004) que PostgREST deja pedir
// como si lo fueran.
export type FeedPost = Post & {
  author: ProfileSummary;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
};

// profiles!author_id = "el perfil al que apunta posts.author_id". Hay que
// decirlo porque posts y profiles están unidos por más de un camino: el
// directo (author_id) y a través de likes, que PostgREST reconoce como
// tabla intermedia (su PK son dos claves foráneas: user_id y post_id) y
// entiende como "los perfiles que dieron like al post". Sin la pista, no
// sabe cuál quieres y devuelve error.
const FEED_POST_COLUMNS = `*, like_count, comment_count, liked_by_me, author:profiles!author_id(${PROFILE_SUMMARY_COLUMNS})`;

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
    .select(FEED_POST_COLUMNS);
  if (error) throw error;
  // Sin tipos generados del esquema, supabase-js no sabe que feed() devuelve
  // una lista de posts, así que se lo decimos nosotros.
  const posts = (data ?? []) as unknown as FeedPost[];
  primePostStats(posts); // likes y comentarios compartidos (lib/postStats.ts)
  return posts;
}

// Un post suelto, para la pantalla de detalle. null si no existe (o se borró)
export async function fetchPost(id: string) {
  const { data, error } = await supabase
    .from('posts')
    .select(FEED_POST_COLUMNS)
    .eq('id', id)
    .maybeSingle<FeedPost>();
  if (error) throw error;
  if (data) primePostStats([data]);
  return data;
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
