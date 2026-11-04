import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Avatar } from '../components/Avatar';
import { confirmAction, showAlert } from '../lib/alert';
import { publicUrl } from '../lib/media';
import { Post, deletePost, fetchUserPosts } from '../lib/posts';
import { Profile, availabilityLabel, disciplineLabel, fetchProfile, fetchProfileCounts } from '../lib/profile';
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
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  // useFocusEffect (y no useEffect) para recargar al volver de "Editar perfil"
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true; // evita actualizar el estado si ya salimos de la pantalla

      load().then((err) => {
        if (active) setError(err);
      });

      return () => {
        active = false;
      };
    }, [userId])
  );

  // Carga perfil, contadores y publicaciones a la vez (Promise.all: en
  // paralelo, no una detrás de otra). Devuelve el error, si lo hay.
  async function load() {
    if (!userId) return null;
    try {
      const [p, c, ps] = await Promise.all([
        fetchProfile(userId),
        fetchProfileCounts(userId),
        fetchUserPosts(userId),
      ]);
      setProfile(p);
      setCounts(c);
      setPosts(ps);
      return null;
    } catch (e: any) {
      return e.message as string;
    }
  }

  function confirmDelete(post: Post) {
    confirmAction('Borrar publicación', 'No se puede deshacer.', 'Borrar', async () => {
      try {
        await deletePost(post);
        await load();
      } catch (e: any) {
        showAlert('No se pudo borrar', e.message);
      }
    });
  }

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
      <Avatar path={profile.avatar_path} name={profile.display_name || profile.username} size={88} />
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

      {/* "No busco trabajos" no se muestra: es lo normal y no aporta */}
      {profile.availability !== 'not_looking' && (
        <Text style={{ color: profile.availability === 'available' ? '#1a7f37' : '#b35900', fontWeight: '600' }}>
          ● {availabilityLabel(profile.availability)}
        </Text>
      )}
      {profile.services_text && <Section title="Servicios" body={profile.services_text} />}

      {profile.contact_link && (
        <Pressable onPress={() => Linking.openURL(profile.contact_link!)}>
          <Text style={styles.link}>{profile.contact_link}</Text>
        </Pressable>
      )}

      <Pressable style={styles.button} onPress={() => router.push('/edit-profile')}>
        <Text style={styles.buttonText}>Editar perfil</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.buttonLight]} onPress={() => router.push('/new-post')}>
        <Text style={[styles.buttonText, { color: '#111' }]}>Nueva publicación</Text>
      </Pressable>

      {posts.length > 0 && (
        <View style={styles.grid}>
          {posts.map((post) => (
            // Mantener pulsado para borrar. Provisional hasta que haya
            // pantalla de detalle de la publicación.
            <Pressable key={post.id} style={styles.tile} onLongPress={() => confirmDelete(post)}>
              <Image source={{ uri: publicUrl('posts', post.media_path) }} style={styles.tileImage} />
            </Pressable>
          ))}
        </View>
      )}

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
  buttonLight: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#111', marginTop: 0 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -1 },
  tile: { width: '33.333%', aspectRatio: 1, padding: 1 },
  tileImage: { flex: 1, backgroundColor: '#eee' },
  signOut: { textAlign: 'center', color: '#c00', marginTop: 8, padding: 8 },
});
