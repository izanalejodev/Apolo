import { Image, Text, View } from 'react-native';
import { publicUrl } from '../lib/media';

// Foto de perfil redonda; si no hay, la inicial del nombre.
// (Va en components/ y no en app/ porque todo lo de app/ es una ruta.)
export function Avatar({ path, name, size = 80 }: { path: string | null; name: string; size?: number }) {
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (path) {
    return <Image source={{ uri: publicUrl('avatars', path) }} style={[circle, { backgroundColor: '#eee' }]} />;
  }

  return (
    <View style={[circle, { backgroundColor: '#ddd', alignItems: 'center', justifyContent: 'center' }]}>
      <Text style={{ fontSize: size * 0.4, fontWeight: '700', color: '#555' }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}
