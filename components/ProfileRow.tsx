import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileSummary } from '../lib/profile';
import { Avatar } from './Avatar';

// Una persona en una lista (búsqueda, seguidores). Al tocarla, su perfil.
export function ProfileRow({ profile }: { profile: ProfileSummary }) {
  const router = useRouter();
  const name = profile.display_name || profile.username;
  return (
    <Pressable
      style={styles.row}
      onPress={() => router.push({ pathname: '/user/[id]', params: { id: profile.id } })}
    >
      <Avatar path={profile.avatar_path} name={name} size={44} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        <Text style={styles.muted} numberOfLines={1}>@{profile.username}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  name: { fontSize: 15, fontWeight: '600' },
  muted: { color: '#666' },
});
