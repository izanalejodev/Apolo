import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PostGrid } from '../../components/PostGrid';
import { ProfileCounts, ProfileHeader, profileButtons as b } from '../../components/ProfileHeader';
import { confirmAction, showAlert } from '../../lib/alert';
import { openDm } from '../../lib/chat';
import { follow, isFollowing, unfollow } from '../../lib/follows';
import { blockUser, isBlockedByMe, unblockUser } from '../../lib/moderation';
import { Post, fetchUserPosts } from '../../lib/posts';
import { Profile, fetchProfile, fetchProfileCounts } from '../../lib/profile';
import { useAuth } from '../../providers/AuthProvider';

// Perfil de otra persona: lo mismo que el mío, pero con botones de seguir y
// escribir, y abajo bloquear/denunciar
export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const me = session?.user.id;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<ProfileCounts | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [blocked, setBlocked] = useState(false); // ¿lo he bloqueado yo?
  const [busy, setBusy] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // isActive: para no tocar el estado si ya hemos salido de la pantalla
  const load = useCallback(
    (isActive: () => boolean = () => true) => {
      if (!me || !id) return;
      Promise.all([
        fetchProfile(id),
        fetchProfileCounts(id),
        fetchUserPosts(id), // si hay bloqueo, RLS devuelve 0 publicaciones
        isFollowing(me, id),
        isBlockedByMe(me, id),
      ])
        .then(([p, c, ps, f, bl]) => {
          if (!isActive()) return;
          setProfile(p);
          setCounts(c);
          setPosts(ps);
          setFollowing(f);
          setBlocked(bl);
          setError(null);
        })
        .catch((e) => isActive() && setError(e.message));
    },
    [id, me]
  );

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
      load(() => active);
      return () => {
        active = false;
      };
    }, [id, me, load])
  );

  // Aquí NO es optimista (a diferencia de Seguir): bloquear cambia muchas
  // cosas a la vez (follows, publicaciones, contadores) y es más fiable
  // esperar a la BD y recargar el perfil entero.
  function confirmBlock() {
    if (!id || !profile) return;
    confirmAction(
      `Bloquear a @${profile.username}`,
      'No veréis las publicaciones ni los comentarios del otro, no podréis escribiros y dejaréis de seguiros. No se le avisa.',
      'Bloquear',
      async () => {
        try {
          await blockUser(id);
          load();
        } catch (e: any) {
          showAlert('No se pudo bloquear', e.message);
        }
      }
    );
  }

  async function unblock() {
    if (!me || !id) return;
    try {
      await unblockUser(me, id);
      load();
    } catch (e: any) {
      showAlert('No se pudo desbloquear', e.message);
    }
  }

  function report() {
    if (id) router.push({ pathname: '/report', params: { kind: 'profile', id } });
  }

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

  // La conversación se crea (o se recupera, si ya existía) al pulsar. Si
  // luego no escribes nada no pasa nada: las vacías no salen en la bandeja.
  async function startChat() {
    if (!id || openingChat) return;
    setOpeningChat(true);
    try {
      const conversationId = await openDm(id);
      router.push({ pathname: '/chat/[id]', params: { id: conversationId } });
    } catch (e: any) {
      showAlert('No se pudo abrir el chat', e.message);
    } finally {
      setOpeningChat(false);
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
        {blocked ? (
          <Pressable style={[b.button, b.buttonLight]} onPress={unblock}>
            <Text style={[b.buttonText, b.buttonTextDark]}>Desbloquear</Text>
          </Pressable>
        ) : (
          <View style={styles.buttons}>
            {/* Siguiendo = botón claro (ya está hecho); Seguir = oscuro (acción) */}
            <Pressable style={[b.button, styles.flex, following && b.buttonLight]} onPress={toggleFollow}>
              <Text style={[b.buttonText, following && b.buttonTextDark]}>
                {following ? 'Siguiendo' : 'Seguir'}
              </Text>
            </Pressable>
            <Pressable style={[b.button, b.buttonLight, styles.flex]} onPress={startChat} disabled={openingChat}>
              <Text style={[b.buttonText, b.buttonTextDark]}>{openingChat ? '…' : 'Mensaje'}</Text>
            </Pressable>
          </View>
        )}
      </ProfileHeader>

      {blocked ? (
        <Text style={[styles.muted, { textAlign: 'center' }]}>Has bloqueado a esta cuenta.</Text>
      ) : (
        <PostGrid posts={posts} />
      )}

      <View style={styles.footer}>
        {!blocked && (
          <Pressable onPress={confirmBlock} hitSlop={8}>
            <Text style={styles.danger}>Bloquear</Text>
          </Pressable>
        )}
        <Pressable onPress={report} hitSlop={8}>
          <Text style={styles.danger}>Denunciar perfil</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 24, gap: 14 },
  muted: { color: '#666' },
  buttons: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  footer: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 8, padding: 8 },
  danger: { color: '#c00' },
});
