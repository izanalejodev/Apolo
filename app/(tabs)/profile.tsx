import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PostGrid } from '../../components/PostGrid';
import { ProfileCounts, ProfileHeader, profileButtons as b } from '../../components/ProfileHeader';
import { Post, fetchUserPosts } from '../../lib/posts';
import { Profile, fetchProfile, fetchProfileCounts } from '../../lib/profile';
import { useAuth } from '../../providers/AuthProvider';

// Pestaña "Perfil": el mío, con botones de editar y publicar, y enlace a Ajustes
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

      {/* Para borrar una publicación: tocarla y "Borrar" en el detalle */}
      <PostGrid posts={posts} />

      {/* Cerrar sesión, cuentas bloqueadas, eliminar cuenta, legal... */}
      <Pressable onPress={() => router.push('/settings')}>
        <Text style={styles.link}>Ajustes</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 24, gap: 14 },
  muted: { color: '#666' },
  buttons: { flexDirection: 'row', gap: 8 },
  link: { textAlign: 'center', color: '#444', marginTop: 8, padding: 8 },
});
