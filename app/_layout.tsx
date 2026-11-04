import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../providers/AuthProvider';

// Decide a dónde va el usuario según tenga sesión o no
function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/login'); // sin sesión -> login
    } else if (session && inAuthGroup) {
      router.replace('/'); // con sesión -> pantalla principal
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Stack (en vez de Slot) para tener cabecera y botón de volver
  return (
    <Stack>
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      {/* Las pestañas tienen su propia cabecera: la del Stack, oculta */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="user/[id]" options={{ title: 'Perfil' }} />
      <Stack.Screen name="follow-list" options={{ title: '' }} />
      <Stack.Screen name="edit-profile" options={{ title: 'Editar perfil' }} />
      <Stack.Screen name="new-post" options={{ title: 'Nueva publicación' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
