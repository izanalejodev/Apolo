import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Notificaciones push de mensajes nuevos.
//
// Cómo funciona de punta a punta:
//   1. La app pide permiso y Expo le da un "push token" (la dirección de
//      este móvil). Se guarda en la tabla push_tokens (migración 008).
//   2. Cuando alguien manda un mensaje, un trigger (migración 009) llama a la Edge
//      Function notify-message, que busca los tokens del destinatario y
//      le pide al servicio de Expo que mande la notificación.
//   3. Expo la reenvía a Apple (APNs) o Google (FCM), que la entregan.
// Por qué Expo en medio: habla con Apple y Google por nosotros con una
// sola API, y es gratis.
//
// Dónde NO funciona (y por eso hay tantos "if" abajo):
//   · Web: no hay push en esta versión.
//   · Simulador/emulador: no tienen token.
//   · Expo Go en Android: desde el SDK 53 no permite push. Hace falta una
//     "development build" (eas build --profile development).

// Si la notificación es del chat que tienes abierto, no se enseña el
// aviso (ya estás viendo el mensaje). La pantalla del chat lo apunta aquí.
let activeConversation: string | null = null;
export function setActiveConversation(id: string | null) {
  activeConversation = id;
}

// Qué hacer con una notificación que llega con la app abierta
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const show = n.request.content.data?.conversationId !== activeConversation;
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

function pushSupported() {
  if (Platform.OS === 'web' || !Device.isDevice) return false;
  const expoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  return !(expoGo && Platform.OS === 'android');
}

let currentToken: string | null = null;

// Pide permiso (solo la primera vez sale el diálogo del sistema) y guarda
// el token. Se llama en cada arranque con sesión: el token puede cambiar
// (reinstalar la app, restaurar el móvil) y así siempre está al día.
// Nunca lanza error: sin notificaciones la app funciona igual.
export async function registerForPush() {
  if (!pushSupported()) return;
  try {
    // Android 8+: las notificaciones van en "canales" que el usuario puede
    // silenciar por separado. En Android 13+ hace falta crear uno ANTES de
    // pedir permiso, o el diálogo no sale.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Mensajes',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return; // ha dicho que no: se respeta

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
    });
    if (error) throw error;
    currentToken = token;
  } catch (e) {
    // En Android sin Firebase configurado (google-services.json) falla aquí
    console.warn('No se pudieron activar las notificaciones:', e);
  }
}

// Al cerrar sesión, ANTES de signOut (después ya no hay permiso para
// borrar la fila): este móvil deja de recibir avisos de esta cuenta.
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}

// Al tocar una notificación: a qué chat hay que ir. La llamada que abrió
// la app (con la app cerrada) también llega aquí. Se recuerda cuál se ha
// atendido ya, para no volver a abrir el mismo chat al repintar.
let handledId: string | null = null;
export function conversationFromResponse(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) return null;
  const id = response.notification.request.identifier;
  if (id === handledId) return null;
  handledId = id;
  const conv = response.notification.request.content.data?.conversationId;
  return typeof conv === 'string' ? conv : null;
}
