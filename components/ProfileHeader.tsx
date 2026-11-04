import { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Profile, availabilityLabel, disciplineLabel, fetchProfileCounts } from '../lib/profile';
import { Avatar } from './Avatar';

export type ProfileCounts = Awaited<ReturnType<typeof fetchProfileCounts>>;

type Props = {
  profile: Profile;
  counts: ProfileCounts | null;
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
  children?: ReactNode; // botones: "Editar perfil" en el mío, "Seguir" en el de otro
};

// Todo lo que se ve de un perfil, igual para el mío y el de otros. Lo que
// cambia (los botones) entra por children. Así un cambio de diseño se hace
// en un solo sitio.
export function ProfileHeader({ profile, counts, onPressFollowers, onPressFollowing, children }: Props) {
  return (
    <View style={styles.container}>
      <Avatar path={profile.avatar_path} name={profile.display_name || profile.username} size={88} />
      <Text style={styles.name}>{profile.display_name || profile.username}</Text>
      <Text style={styles.muted}>
        @{profile.username}
        {profile.city ? ` · ${profile.city}` : ''}
      </Text>

      {counts && (
        <View style={styles.counts}>
          <Count n={counts.posts} label="publicaciones" />
          <Count n={counts.followers} label="seguidores" onPress={onPressFollowers} />
          <Count n={counts.following} label="siguiendo" onPress={onPressFollowing} />
        </View>
      )}

      {children}

      {profile.disciplines.length > 0 && (
        <View style={styles.chips}>
          {profile.disciplines.map((d) => (
            <Text key={d} style={[styles.chip, styles.chipDark]}>
              {disciplineLabel(d)}
            </Text>
          ))}
        </View>
      )}

      {profile.styles.length > 0 && (
        <View style={styles.chips}>
          {profile.styles.map((s) => (
            <Text key={s} style={styles.chip}>
              {s}
            </Text>
          ))}
        </View>
      )}

      {profile.bio && <Text style={styles.text}>{profile.bio}</Text>}

      {/* "No busco trabajos" no se muestra: es lo normal y no aporta */}
      {profile.availability !== 'not_looking' && (
        <Text style={{ color: profile.availability === 'available' ? '#1a7f37' : '#b35900', fontWeight: '600' }}>
          ● {availabilityLabel(profile.availability)}
        </Text>
      )}

      {profile.services_text && (
        <View style={{ gap: 4 }}>
          <Text style={styles.sectionTitle}>Servicios</Text>
          <Text style={styles.text}>{profile.services_text}</Text>
        </View>
      )}

      {profile.contact_link && (
        <Pressable onPress={() => Linking.openURL(profile.contact_link!)}>
          <Text style={styles.link}>{profile.contact_link}</Text>
        </Pressable>
      )}
    </View>
  );
}

function Count({ n, label, onPress }: { n: number; label: string; onPress?: () => void }) {
  return (
    <Pressable style={{ alignItems: 'center' }} onPress={onPress} disabled={!onPress}>
      <Text style={{ fontSize: 18, fontWeight: '700' }}>{n}</Text>
      <Text style={styles.muted}>{label}</Text>
    </Pressable>
  );
}

// Estilos de botón compartidos por las pantallas de perfil
export const profileButtons = StyleSheet.create({
  button: { backgroundColor: '#111', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonLight: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111' },
  buttonTextDark: { color: '#111' },
});

const styles = StyleSheet.create({
  container: { gap: 14 },
  name: { fontSize: 26, fontWeight: '700' },
  muted: { color: '#666' },
  counts: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  chipDark: { backgroundColor: '#111', borderColor: '#111', color: '#fff' },
  text: { fontSize: 15, lineHeight: 21 },
  sectionTitle: { fontWeight: '700', fontSize: 13, color: '#666', textTransform: 'uppercase' },
  link: { color: '#0a66c2', fontSize: 15 },
});
