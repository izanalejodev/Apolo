import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { showAlert } from '../../lib/alert';
import {
  MESSAGES_PAGE_SIZE,
  MESSAGE_MAX,
  Message,
  fetchMessages,
  fetchPeer,
  markRead,
  mergeMessages,
  messageTime,
  sendMessage,
  subscribeToMessages,
} from '../../lib/chat';
import { ProfileSummary } from '../../lib/profile';
import { usePagedList } from '../../lib/usePagedList';
import { useAuth } from '../../providers/AuthProvider';

// Un chat 1 a 1. Los mensajes van del más nuevo al más antiguo en una
// lista invertida: el más nuevo queda abajo (como en cualquier chat) y al
// subir se cargan los anteriores con el scroll infinito de siempre.
export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = session?.user.id;

  // undefined = cargando; null = no existe o no soy miembro
  const [peer, setPeer] = useState<ProfileSummary | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const messages = usePagedList<Message>({
    fetchPage: (last) => fetchMessages(id, last),
    pageSize: MESSAGES_PAGE_SIZE,
    keyOf: (m) => m.id,
  });
  const { reload, update } = messages;

  useEffect(() => {
    if (!id || !me) return;
    let active = true;
    fetchPeer(id, me)
      .then((p) => active && setPeer(p))
      .catch((e) => active && (setPeer(null), showAlert('No se pudo abrir el chat', e.message)));
    return () => {
      active = false;
    };
  }, [id, me]);

  // Tiempo real. El orden importa y tiene trampa:
  //  1. Se carga la lista enseguida, para no esperar a la conexión.
  //  2. Al quedar suscritos se recarga OTRA vez: un mensaje que llegue
  //     entre la primera carga y la suscripción no vendría por ningún lado.
  //     (Lo mismo al reconectar: lo de mientras no había red, se recupera.)
  //  3. Los mensajes que llegan por Realtime MIENTRAS una recarga está en
  //     camino podrían no ir en ella y, además, la recarga pisa la lista. Por
  //     eso se apuntan en `pending` y se vuelven a meter al terminar.
  const pending = useRef<Message[]>([]);
  useEffect(() => {
    if (!id || !me) return;
    reload({ clear: true }).then(() => markRead(id).catch(() => {}));

    const unsubscribe = subscribeToMessages(
      id,
      (m) => {
        pending.current.push(m);
        update((list) => mergeMessages(list, [m]));
        // Si estoy mirando el chat cuando llega, ya lo he leído
        if (m.sender_id !== me) markRead(id).catch(() => {});
      },
      () => {
        reload().then(() => {
          update((list) => mergeMessages(list, pending.current));
          pending.current = [];
        });
      }
    );
    return unsubscribe;
  }, [id, me, reload, update]);

  async function send() {
    const body = text.trim();
    if (!me || !id || !body || sending) return;
    setSending(true);
    try {
      const created = await sendMessage(me, id, body);
      // Como los comentarios: esperamos a la BD (id y fecha reales). Si
      // Realtime trae el mismo mensaje, mergeMessages no lo duplica.
      update((list) => mergeMessages(list, [created]));
      setText('');
    } catch (e: any) {
      showAlert('No se pudo enviar', e.message);
    } finally {
      setSending(false);
    }
  }

  if (peer === null) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Chat' }} />
        <Text style={styles.muted}>Esta conversación no existe.</Text>
      </View>
    );
  }

  const peerName = peer ? peer.display_name || peer.username : '';
  const openPeer = () => peer && router.push({ pathname: '/user/[id]', params: { id: peer.id } });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <Stack.Screen
        options={{
          headerTitle: () =>
            peer ? (
              <Pressable style={styles.headerTitle} onPress={openPeer}>
                <Avatar path={peer.avatar_path} name={peerName} size={28} />
                <Text style={styles.headerName} numberOfLines={1}>{peerName}</Text>
              </Pressable>
            ) : null,
        }}
      />

      {!messages.items ? (
        <View style={styles.center}>
          {messages.error ? (
            <Text style={styles.muted}>No se pudieron cargar los mensajes: {messages.error}</Text>
          ) : (
            <ActivityIndicator size="large" />
          )}
        </View>
      ) : (
        <FlatList
          data={messages.items}
          inverted
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <Bubble message={item} mine={item.sender_id === me} />}
          // Invertida: el "final" es arriba del todo, los mensajes antiguos
          onEndReached={messages.loadMore}
          onEndReachedThreshold={0.5}
          // En una lista invertida el footer se pinta arriba
          ListFooterComponent={messages.loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : undefined}
          ListEmptyComponent={
            <Text style={[styles.muted, styles.empty]}>
              Escribe el primer mensaje{peer ? ` a @${peer.username}` : ''}.
            </Text>
          }
          contentContainerStyle={{ padding: 12, gap: 4 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Mensaje…"
          maxLength={MESSAGE_MAX}
          multiline
        />
        <Pressable onPress={send} disabled={!text.trim() || sending} hitSlop={8}>
          <Text style={[styles.send, (!text.trim() || sending) && styles.sendDisabled]}>
            {sending ? '…' : 'Enviar'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  return (
    <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
      <Text style={[styles.body, mine && styles.bodyMine]}>{message.body}</Text>
      <Text style={[styles.time, mine && styles.timeMine]}>{messageTime(message.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: '#666' },
  empty: { textAlign: 'center', margin: 24 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 240 },
  headerName: { fontSize: 17, fontWeight: '600' },
  bubble: { maxWidth: '80%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#111' },
  bubbleTheirs: { alignSelf: 'flex-start', backgroundColor: '#eee' },
  body: { fontSize: 15, lineHeight: 20, color: '#111' },
  bodyMine: { color: '#fff' },
  time: { fontSize: 11, color: '#666', alignSelf: 'flex-end' },
  timeMine: { color: '#bbb' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
  },
  send: { color: '#111', fontSize: 16, fontWeight: '600' },
  sendDisabled: { color: '#aaa' },
});
