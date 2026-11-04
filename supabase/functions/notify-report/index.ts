// Edge Function: te avisa por Telegram cuando llega una denuncia nueva.
//
// Por qué: Apple pide actuar sobre las denuncias en 24 h. Sin aviso
// tendrías que entrar al panel cada día a mirar la tabla reports.
//
// Cómo se dispara: un Database Webhook de Supabase (Database > Webhooks)
// sobre INSERT en public.reports llama a esta función con la fila nueva.
//
// Privacidad: el mensaje NO lleva el contenido denunciado ni los detalles
// que escribió quien denuncia (pueden ser mensajes privados), solo el tipo
// y el motivo. El contenido se mira en el panel de Supabase. Así no se
// manda nada personal a un tercero (Telegram).
//
// Secretos (Edge Functions > Secrets):
//   TELEGRAM_BOT_TOKEN  el token que da @BotFather
//   TELEGRAM_CHAT_ID    tu chat con el bot
//   WEBHOOK_SECRET      una cadena larga al azar; el webhook la manda en la
//                       cabecera x-webhook-secret. Sin ella, cualquiera que
//                       conociera la URL podría mandarte avisos falsos.
//
// Despliegue: con "Verify JWT" DESACTIVADO (quien llama es el webhook, no
// un usuario; la protección es WEBHOOK_SECRET).

import { createClient } from 'npm:@supabase/supabase-js@2';

const KIND: Record<string, string> = {
  post: 'publicación',
  comment: 'comentario',
  message: 'mensaje',
  profile: 'perfil',
};

const REASON: Record<string, string> = {
  spam: 'spam o estafa',
  harassment: 'acoso',
  hate: 'odio',
  nudity: 'desnudos / sexual',
  violence: 'violencia o amenazas',
  impersonation: 'suplantación',
  other: 'otro motivo',
};

Deno.serve(async (req) => {
  const secret = Deno.env.get('WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-webhook-secret') !== secret) {
    return new Response('No autorizado', { status: 401 });
  }

  const payload = await req.json();
  if (payload?.type !== 'INSERT' || payload?.table !== 'reports') {
    return new Response('Ignorado', { status: 200 });
  }
  const report = payload.record;

  // Cuántas quedan por revisar, para ver de un vistazo si se acumulan
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { count } = await admin
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

  const text = [
    `🚩 Nueva denuncia: ${KIND[report.target_kind] ?? report.target_kind} · ${REASON[report.reason] ?? report.reason}`,
    `Pendientes: ${count ?? '?'}`,
    `id: ${report.id}`,
  ].join('\n');

  const res = await fetch(`https://api.telegram.org/bot${Deno.env.get('TELEGRAM_BOT_TOKEN')}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: Deno.env.get('TELEGRAM_CHAT_ID'), text }),
  });

  if (!res.ok) {
    console.error('notify-report: Telegram respondió', res.status, await res.text());
    return new Response('Error al avisar', { status: 502 });
  }
  return new Response('ok', { status: 200 });
});
