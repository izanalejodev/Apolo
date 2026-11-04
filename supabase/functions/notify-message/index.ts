// Edge Function: manda una notificación push a quien recibe un mensaje.
//
// Cómo se dispara: el trigger messages_notify (migración 009) llama a esta
// función con la fila nueva en cada INSERT en public.messages. Igual que
// notify-report.
//
// Qué hace:
//   1. Busca los otros miembros de la conversación (en V1, uno) y sus
//      tokens en push_tokens.
//   2. Se los manda al servicio push de Expo, que los reenvía a Apple/Google.
//   3. Si Expo dice que un token ya no vale (desinstaló la app), lo borra.
//
// Privacidad: la notificación lleva el nombre de quien escribe y el
// principio del mensaje (como cualquier app de chat). Pasa por Expo y por
// Apple/Google para llegar al móvil; está puesto en la política de
// privacidad (lib/legal.ts, apartado 4).
//
// Secretos (Edge Functions > Secrets):
//   WEBHOOK_SECRET     el mismo que usa notify-report (cabecera x-webhook-secret)
//   EXPO_ACCESS_TOKEN  opcional: solo si activas "Enhanced push security"
//                      en expo.dev; entonces Expo exige este token
//
// Despliegue: con "Verify JWT" DESACTIVADO (quien llama es el webhook).

import { createClient } from 'npm:@supabase/supabase-js@2';

const PREVIEW_MAX = 120; // lo que cabe en una notificación sin cortarse raro

Deno.serve(async (req) => {
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('No autorizado', { status: 401 });
  }

  const payload = await req.json();
  if (payload?.type !== 'INSERT' || payload?.table !== 'messages') {
    return new Response('Ignorado', { status: 200 });
  }
  const message = payload.record as { id: string; conversation_id: string; sender_id: string; body: string };

  // service_role: tiene que leer tokens de OTRA persona, que RLS no deja
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [{ data: members, error: membersError }, { data: sender }] = await Promise.all([
    admin
      .from('conversation_members')
      .select('user_id')
      .eq('conversation_id', message.conversation_id)
      .neq('user_id', message.sender_id),
    admin.from('profiles').select('username, display_name').eq('id', message.sender_id).maybeSingle(),
  ]);
  if (membersError) {
    console.error('notify-message: miembros', membersError);
    return new Response('Error', { status: 500 });
  }

  const recipients = (members ?? []).map((m) => m.user_id as string);
  if (recipients.length === 0) return new Response('Sin destinatarios', { status: 200 });

  const { data: tokens, error: tokensError } = await admin
    .from('push_tokens')
    .select('token')
    .in('user_id', recipients);
  if (tokensError) {
    console.error('notify-message: tokens', tokensError);
    return new Response('Error', { status: 500 });
  }
  if (!tokens || tokens.length === 0) return new Response('Sin tokens', { status: 200 });

  const title = sender?.display_name || (sender?.username ? `@${sender.username}` : 'Mensaje nuevo');
  const text = message.body.replace(/\s+/g, ' ').trim();
  const body = text.length > PREVIEW_MAX ? `${text.slice(0, PREVIEW_MAX - 1)}…` : text;

  // Formato de https://docs.expo.dev/push-notifications/sending-notifications/
  // Hasta 100 por petición; en un chat 1 a 1 son uno o dos móviles.
  const notifications = tokens.map(({ token }) => ({
    to: token,
    title,
    body,
    sound: 'default',
    channelId: 'messages', // el canal que crea la app en Android (lib/push.ts)
    // Lo que lee la app al tocar la notificación para abrir el chat
    data: { conversationId: message.conversation_id },
  }));

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(notifications),
  });
  if (!res.ok) {
    console.error('notify-message: Expo respondió', res.status, await res.text());
    return new Response('Error al enviar', { status: 502 });
  }

  // Expo responde un "ticket" por notificación, en el mismo orden. Si dice
  // DeviceNotRegistered, ese móvil ya no tiene la app: se borra el token
  // para no seguir mandándole nada.
  const { data: tickets } = await res.json();
  const dead = (tickets ?? [])
    .map((t: any, i: number) => (t?.details?.error === 'DeviceNotRegistered' ? notifications[i].to : null))
    .filter(Boolean);
  if (dead.length > 0) await admin.from('push_tokens').delete().in('token', dead);

  return new Response('ok', { status: 200 });
});
