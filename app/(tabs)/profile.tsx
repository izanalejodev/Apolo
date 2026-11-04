import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PostGrid } from '../../components/PostGrid';
import { ProfileCounts, ProfileHeader, profileButtons as b } from '../../components/ProfileHeader';
import { confirmAction, showAlert } from '../../lib/alert';
import { Post, deletePost, fetchUserPosts } from '../../lib/posts';
import { Profile, fetchProfile, fetchProfileCounts } from '../../lib/profile';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';

// Pestaña "Perfil": el mío, con botones de editar, publicar y cerrar sesión
export default function MyProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<ProfileCounts | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);

  const userId = session?.user.id;

  // useFocusEffect (y no useEffect) para recargar al volver de "Editar
  // perfil", de publicar o de seguir a alguien
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

  // Perfil, contadores y publicaciones en paralelo. Devuelve el error, si lo hay.
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

  function openList(kind: 'followers' | 'following') {
    if (userId) router.push({ pathname: '/follow-list', params: { userId, kind } });
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
      <ProfileHeader
        profile={profile}
        counts={counts}
        onPressFollowers={() => openList('followers')}
        onPressFollowing={() => openList('following')}
      >
        <View style={styles.buttons}>
          <Pressable style={[b.button, { flex: 1 }]} onPress={() => router.push('/edit-profile')}>
            <Text style={b.buttonText}>Editar perfil</Text>
          </Pressable>
          <Pressable style={[b.button, b.buttonLight, { flex: 1 }]} onPress={() => router.push('/new-post')}>
            <Text style={[b.buttonText, b.buttonTextDark]}>Publicar</Text>
          </Pressable>
        </View>
      </ProfileHeader>

      {/* Mantener pulsado para borrar. Provisional hasta que haya pantalla
          de detalle de la publicación. */}
      <PostGrid posts={posts} onLongPress={confirmDelete} />

      <Pressable onPress={confirmSignOut}>
        <Text style={styles.signOut}>Cerrar sesión</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 24, gap: 14 },
  muted: { color: '#666' },
  buttons: { flexDirection: 'row', gap: 8 },
  signOut: { textAlign: 'center', color: '#c00', marginTop: 8, padding: 8 },
});
