import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileSummary } from '../lib/profile';
import { Avatar } from './Avatar';

// Una persona en una lista (explorar, seguidores). Al tocarla, su perfil.
// detail: línea extra opcional, p. ej. "Madrid · Baile"
export function ProfileRow({ profile, detail }: { profile: ProfileSummary; detail?: string }) {
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
        {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  name: { fontSize: 15, fontWeight: '600' },
  muted: { color: '#666' },
  detail: { color: '#444', fontSize: 13, marginTop: 2 },
});
