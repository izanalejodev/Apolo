import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

// Buckets de supabase/storage.sql
export type Bucket = 'avatars' | 'posts';

export type PickedImage = { uri: string; width: number; height: number };

// Abre la galería. No pide permiso: en iOS 14+ y Android 13+ el selector del
// sistema solo le pasa a la app la foto elegida, no acceso a toda la galería.
export async function pickImage({ square = false } = {}): Promise<PickedImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // Recorte cuadrado solo para el avatar. Para publicaciones no, porque en
    // iOS el editor del sistema solo sabe recortar en cuadrado.
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1, // sin comprimir aquí: comprimimos una sola vez en prepareImage
  });
  if (result.canceled) return null;
  const { uri, width, height } = result.assets[0];
  return { uri, width, height };
}

// Reduce la foto a `maxSide` píxeles en su lado mayor y la guarda como JPEG.
// Por qué: una foto de móvil pesa 3-10 MB y tiene 4000 px. Para verla en una
// pantalla sobran 1440 px, y así pesa ~300-500 KB: sube más rápido, gasta
// menos datos a quien la ve y menos almacenamiento (que se paga).
// Además, al generar un JPEG nuevo no se copian los metadatos del original
// (como la ubicación GPS donde se hizo la foto).
// Devuelve también el tamaño final, que se guarda con la publicación.
export async function prepareImage(image: PickedImage, maxSide: number): Promise<PickedImage> {
  const context = ImageManipulator.manipulate(image.uri);
  const longest = Math.max(image.width, image.height);
  if (!longest || longest > maxSide) {
    context.resize(image.width >= image.height ? { width: maxSide } : { height: maxSide });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

// Sube un JPEG a <bucket>/<userId>/<nombre único>.jpg y devuelve esa ruta,
// que es lo que se guarda en la base de datos.
export async function uploadImage(bucket: Bucket, userId: string, uri: string) {
  // fetch + arrayBuffer funciona igual con file:// (móvil) y blob: (web)
  const body = await fetch(uri).then((r) => r.arrayBuffer());
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const path = `${userId}/${name}`;

  const { error } = await supabase.storage.from(bucket).upload(path, body, {
    contentType: 'image/jpeg',
    // Un archivo nunca cambia (cada foto tiene nombre nuevo), así que el CDN
    // y el móvil pueden cachearlo un año sin riesgo de mostrar algo viejo.
    cacheControl: '31536000',
  });
  if (error) throw error;
  return path;
}

// Construye la URL pública a partir de la ruta. No hace ninguna petición.
// Guardamos la ruta y no la URL para no atarnos al dominio de Supabase: si
// algún día ponemos un CDN delante, solo cambia esta función.
export function publicUrl(bucket: Bucket, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function removeFile(bucket: Bucket, path: string) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
