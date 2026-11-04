import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PostGrid } from '../../components/PostGrid';
import { ProfileCounts, ProfileHeader, profileButtons as b } from '../../components/ProfileHeader';
import { showAlert } from '../../lib/alert';
import { follow, isFollowing, unfollow } from '../../lib/follows';
import { Post, fetchUserPosts } from '../../lib/posts';
import { Profile, fetchProfile, fetchProfileCounts } from '../../lib/profile';
import { useAuth } from '../../providers/AuthProvider';

// Perfil de otra persona: lo mismo que el mío, pero con botón de seguir
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const me = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<ProfileCounts | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!me || !id) return;
      // Si alguien llega a su propio perfil por aquí (desde una lista), lo
      // mandamos a su pestaña, que es la que tiene "Editar perfil"
      if (id === me) {
        router.replace('/profile');
        return;
      }
      let active = true;
      Promise.all([fetchProfile(id), fetchProfileCounts(id), fetchUserPosts(id), isFollowing(me, id)])
        .then(([p, c, ps, f]) => {
          if (!active) return;
          setProfile(p);
          setCounts(c);
          setPosts(ps);
          setFollowing(f);
          setError(null);
        })
        .catch((e) => active && setError(e.message));
      return () => {
        active = false;
      };
    }, [id, me])
  );

  // Actualización optimista: cambiamos el botón y el contador AL MOMENTO y
  // luego hablamos con la BD. Si falla, lo dejamos como estaba. Así el botón
  // responde al instante aunque la red tarde medio segundo.
  async function toggleFollow() {
    if (!me || !id || busy) return; // busy: evita doble toque mientras va la petición
    const next = !following;
    setBusy(true);
    setFollowing(next);
    setCounts((c) => c && { ...c, followers: c.followers + (next ? 1 : -1) });
    try {
      await (next ? follow(me, id) : unfollow(me, id));
    } catch (e: any) {
      setFollowing(!next);
      setCounts((c) => c && { ...c, followers: c.followers + (next ? -1 : 1) });
      showAlert(next ? 'No se pudo seguir' : 'No se pudo dejar de seguir', e.message);
    } finally {
      setBusy(false);
    }
  }

  function openList(kind: 'followers' | 'following') {
    if (id) router.push({ pathname: '/follow-list', params: { userId: id, kind } });
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
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      <ProfileHeader
        profile={profile}
        counts={counts}
        onPressFollowers={() => openList('followers')}
        onPressFollowing={() => openList('following')}
      >
        {/* Siguiendo = botón claro (ya está hecho); Seguir = oscuro (acción) */}
        <Pressable style={[b.button, following && b.buttonLight]} onPress={toggleFollow}>
          <Text style={[b.buttonText, following && b.buttonTextDark]}>
            {following ? 'Siguiendo' : 'Seguir'}
          </Text>
        </Pressable>
      </ProfileHeader>

      <PostGrid posts={posts} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 24, gap: 14 },
  muted: { color: '#666' },
});
