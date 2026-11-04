import { Tabs } from 'expo-router/js-tabs';
import { useEffect } from 'react';
import { ColorValue, Text } from 'react-native';
import { registerForPush } from '../../lib/push';
import { useOpenChatFromNotification } from '../../lib/useOpenChatFromNotification';
import { useUnreadCount } from '../../lib/unread';
import { useAuth } from '../../providers/AuthProvider';

// Barra de pestañas inferior. Los iconos son caracteres de texto para no
// añadir una librería de iconos todavía; se cambian cuando haya diseño.
function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

// Las pestañas solo se ven con sesión, así que este es el sitio para lo que
// necesita sesión y dura toda la app: notificaciones y el globo de no leídos.
export default function TabsLayout() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const unread = useUnreadCount(!!userId);

  // El permiso se pide al entrar con sesión. Se podría esperar a que use el
  // chat, pero entonces quien aún no ha escrito a nadie no se enteraría de
  // que le han escrito, que es justo el aviso que más importa.
  useEffect(() => {
    if (userId) registerForPush();
  }, [userId]);

  // Tocar una notificación abre esa conversación (en web no hace nada)
  useOpenChatFromNotification();

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#111' }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="explore" options={{ title: 'Explorar', tabBarIcon: icon('⌕') }} />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Mensajes',
          tabBarIcon: icon('✉'),
          // undefined = sin globo. Más de 9 se queda en "9+" para que quepa
          tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined,
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Mi perfil', tabBarIcon: icon('●') }} />
    </Tabs>
  );
}
