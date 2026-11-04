import { PickedImage, prepareImage, removeFile, uploadImage } from './media';
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

// Primero la fila (lo que ve la gente) y luego el archivo. Si fallara el
// segundo paso queda un archivo huérfano, que no se ve; al revés quedaría una
// publicación con la imagen rota.
export async function deletePost(post: Post) {
  const { error } = await supabase.from('posts').delete().eq('id', post.id);
  if (error) throw error;
  await removeFile('posts', post.media_path).catch(() => {});
}
