import { useLastNotificationResponse } from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { conversationFromResponse } from './push';

// Tocar una notificación (con la app abierta, en segundo plano o cerrada)
// abre esa conversación.
//
// Hay una versión .web.ts que no hace nada: en web, expo-notifications no
// tiene esta función y lanza un error nada más montar la pantalla. Metro
// elige solo el fichero .web.ts al compilar para el navegador.
export function useOpenChatFromNotification() {
  const router = useRouter();
  const response = useLastNotificationResponse();
  useEffect(() => {
    const conversationId = conversationFromResponse(response);
    if (conversationId) router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
  }, [response]);
}
