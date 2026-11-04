// Edge Function: borra la cuenta de quien la llama (Apple lo exige desde
// 2022: si se puede crear la cuenta en la app, se tiene que poder borrar en
// la app).
//
// Por qué una Edge Function: borrar un usuario de auth.users solo se puede
// con la clave service_role, que se salta todo (RLS incluido) y por eso
// NUNCA puede ir en la app. Aquí vive en el servidor de Supabase, que la
// pone sola en la variable SUPABASE_SERVICE_ROLE_KEY.
//
// Qué borra:
//  1. Los archivos de Storage (avatars/<id>/ y posts/<id>/). No se borran
//     solos al borrar el usuario, y son fotos públicas: se quedarían
//     accesibles para siempre con la URL. Van PRIMERO: si algo falla
//     después, el usuario puede reintentar; al revés quedarían fotos
//     huérfanas de alguien que ya no existe.
//  2. El usuario de auth.users. Todo lo demás cae en cascada (on delete
//     cascade): perfil, publicaciones, comentarios, likes, follows,
//     mensajes, bloqueos y aceptación de términos. Las denuncias se quedan
//     (reporter_id/reported_user_id pasan a null) con su copia del contenido.
//
// Despliegue: con "Verify JWT" DESACTIVADO. La sesión se comprueba aquí
// dentro con auth.getUser(), que pregunta al servidor de Auth y funciona con
// cualquier tipo de clave del proyecto (las antiguas y las nuevas).

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

// La app web llama desde otro dominio: el navegador pide permiso antes (CORS)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const BUCKETS = ['avatars', 'posts'];

// list() devuelve como mucho `limit` archivos: se borra de 100 en 100 hasta
// que no quede nada. El tope de vueltas evita un bucle infinito si algo
// raro hiciera que remove() no borrase.
async function removeFolder(admin: SupabaseClient, bucket: string, folder: string) {
  for (let i = 0; i < 200; i++) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 100 });
    if (error) throw error;
    if (!data || data.length === 0) return;
    const { error: removeError } = await admin.storage
      .from(bucket)
      .remove(data.map((f) => `${folder}/${f.name}`));
    if (removeError) throw removeError;
  }
  throw new Error(`No se pudieron borrar todos los archivos de ${bucket}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) return json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en la función' }, 500);

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Hace falta iniciar sesión' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ¿Quién llama? Se saca del token, nunca de algo que mande la app: si no,
  // cualquiera podría borrar la cuenta de otro pasando su id.
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: 'Sesión no válida' }, 401);

  try {
    for (const bucket of BUCKETS) await removeFolder(admin, bucket, user.id);

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    return json({ ok: true });
  } catch (e) {
    console.error('delete-account', user.id, e);
    return json({ error: e instanceof Error ? e.message : 'Error al borrar la cuenta' }, 500);
  }
});
