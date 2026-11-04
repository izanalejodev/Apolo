import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '../../components/Avatar';
import {
  CONVERSATIONS_PAGE_SIZE,
  ConversationSummary,
  fetchConversations,
  subscribeToMessages,
} from '../../lib/chat';
import { timeAgo } from '../../lib/posts';
import { usePagedList } from '../../lib/usePagedList';
import { useAuth } from '../../providers/AuthProvider';

// Pestaña "Mensajes": mis conversaciones, la más reciente arriba
export default function MessagesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const me = session?.user.id;

  const inbox = usePagedList<ConversationSummary>({
    fetchPage: fetchConversations,
    pageSize: CONVERSATIONS_PAGE_SIZE,
    keyOf: (c) => c.id,
  });
  const { reload } = inbox;

  // A diferencia del feed, aquí SÍ se recarga cada vez que vuelves: al
  // salir de un chat hay que quitar el "no leído" y subir esa conversación
  // arriba. Es una lista corta y barata.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  // Si llega un mensaje (de cualquier conversación mía) con la pestaña
  // abierta, se recarga: cambia el orden, el último mensaje y el "no leído".
  // Más sencillo y menos propenso a errores que recolocar la lista a mano.
  useEffect(() => subscribeToMessages(null, () => reload(), () => reload()), [reload]);

  if (!inbox.items) {
    return (
      <View style={styles.center}>
        {inbox.error ? (
          <Text style={styles.muted}>No se pudieron cargar los mensajes: {inbox.error}</Text>
        ) : (
          <ActivityIndicator size="large" />
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={inbox.items}
      keyExtractor={(c) => c.id}
      renderItem={({ item }) => (
        <ConversationRow
          conversation={item}
          me={me}
          onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
        />
      )}
      onEndReached={inbox.loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={<RefreshControl refreshing={inbox.refreshing} onRefresh={inbox.pullToRefresh} />}
      contentContainerStyle={inbox.items.length === 0 ? { flex: 1 } : undefined}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Sin mensajes</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Entra en el perfil de alguien y pulsa «Mensaje» para escribirle.
          </Text>
        </View>
      }
      ListFooterComponent={inbox.loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : undefined}
    />
  );
}

function ConversationRow({
  conversation: c,
  me,
  onPress,
}: {
  conversation: ConversationSummary;
  me?: string;
  onPress: () => void;
}) {
  const name = c.other.display_name || c.other.username;
  const preview = (c.last_sender_id === me ? 'Tú: ' : '') + c.last_body.replace(/\s+/g, ' ');
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Avatar path={c.other.avatar_path} name={name} size={52} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.topLine}>
          <Text style={[styles.name, c.unread && styles.bold]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.time}>{timeAgo(c.last_at)}</Text>
        </View>
        <Text style={[styles.preview, c.unread && styles.previewUnread]} numberOfLines={1}>
          {preview}
        </Text>
      </View>
      {c.unread && <View style={styles.dot} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  muted: { color: '#666' },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  topLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontSize: 15, fontWeight: '500' },
  bold: { fontWeight: '700' },
  time: { color: '#888', fontSize: 12 },
  preview: { color: '#666', fontSize: 14 },
  previewUnread: { color: '#111', fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#0a66c2' },
});
