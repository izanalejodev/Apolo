import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { confirmAction } from '../lib/alert';
import { Profile, disciplineLabel, fetchProfile, fetchProfileCounts } from '../lib/profile';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

type Counts = Awaited<ReturnType<typeof fetchProfileCounts>>;

// Mi perfil. De momento es la pantalla principal; cuando haya feed pasará a
// ser una pestaña.
export default function MyProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  // useFocusEffect (y no useEffect) para recargar al volver de "Editar perfil"
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true; // evita actualizar el estado si ya salimos de la pantalla

      Promise.all([fetchProfile(userId), fetchProfileCounts(userId)])
        .then(([p, c]) => {
          if (!active) return;
          setProfile(p);
          setCounts(c);
          setError(null);
        })
        .catch((e) => active && setError(e.message));

      return () => {
        active = false;
      };
    }, [userId])
  );

  function confirmSignOut() {
    confirmAction('Cerrar sesión', '¿Seguro que quieres salir?', 'Salir', () =>
      supabase.auth.signOut()
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No se pudo cargar el perfil: {error}</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.name}>{profile.display_name || profile.username}</Text>
      <Text style={styles.muted}>
        @{profile.username}
        {profile.city ? ` · ${profile.city}` : ''}
      </Text>

      {counts && (
        <View style={styles.counts}>
          <Count n={counts.posts} label="publicaciones" />
          <Count n={counts.followers} label="seguidores" />
          <Count n={counts.following} label="siguiendo" />
        </View>
      )}

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

      {profile.availability && <Section title="Disponibilidad" body={profile.availability} />}
      {profile.services_text && <Section title="Servicios" body={profile.services_text} />}

      {profile.contact_link && (
        <Pressable onPress={() => Linking.openURL(profile.contact_link!)}>
          <Text style={styles.link}>{profile.contact_link}</Text>
        </Pressable>
      )}

      <Pressable style={styles.button} onPress={() => router.push('/edit-profile')}>
        <Text style={styles.buttonText}>Editar perfil</Text>
      </Pressable>

      <Pressable onPress={confirmSignOut}>
        <Text style={styles.signOut}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontSize: 18, fontWeight: '700' }}>{n}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.text}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 24, gap: 14 },
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
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  signOut: { textAlign: 'center', color: '#c00', marginTop: 8, padding: 8 },
});
