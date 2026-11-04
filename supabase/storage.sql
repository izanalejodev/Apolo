-- =====================================================================
-- Storage: dónde viven las fotos (y más adelante avatares de vídeo, etc.)
--
-- Ejecutar después de schema.sql. Se puede volver a ejecutar sin problema.
--
-- Organización de archivos: <bucket>/<id del usuario>/<archivo>.jpg
--   p. ej. posts/8f1c.../1730712345678-ab12cd.jpg
-- La primera carpeta es siempre el id del dueño: así las políticas pueden
-- saber de quién es un archivo solo mirando su ruta.
-- =====================================================================

-- Buckets públicos: cualquiera con la URL puede ver la imagen (igual que en
-- Instagram/TikTok, cuyas imágenes se sirven por CDN sin login). Lo que NO es
-- público es subir o borrar: eso lo controlan las políticas de abajo.
--
-- Los límites de tamaño y tipo se aplican en el servidor: aunque alguien se
-- salte la app, no puede subir un archivo de 200 MB ni un .exe.
-- Solo JPEG porque la app convierte todas las fotos a JPEG antes de subirlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 1048576, array['image/jpeg']),  -- 1 MB
  ('posts',   'posts',   true, 5242880, array['image/jpeg'])   -- 5 MB
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- Subir: solo dentro de tu carpeta
drop policy if exists "media: subes solo a tu carpeta" on storage.objects;
create policy "media: subes solo a tu carpeta"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'posts')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Ver los metadatos de tus archivos. No hace falta para mostrar imágenes
-- (los buckets son públicos), pero Supabase lo exige para poder borrarlos.
drop policy if exists "media: ves los metadatos de lo tuyo" on storage.objects;
create policy "media: ves los metadatos de lo tuyo"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('avatars', 'posts')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Borrar: solo lo tuyo
drop policy if exists "media: borras solo de tu carpeta" on storage.objects;
create policy "media: borras solo de tu carpeta"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'posts')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Sin política de UPDATE: los archivos no se sobrescriben nunca. Cada foto
-- nueva tiene un nombre nuevo (ver lib/media.ts), lo que además permite que
-- el CDN la cachee para siempre.
