import { Button, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

// Pantalla provisional tras iniciar sesión. Se sustituirá por el feed / perfil.
export default function Home() {
  const { session } = useAuth();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
      <Text>Sesión iniciada como {session?.user.email}</Text>
      <Button title="Cerrar sesión" onPress={() => supabase.auth.signOut()} />
    </View>
  );
}
