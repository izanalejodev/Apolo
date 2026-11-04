import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { FeedItem } from '../../components/FeedItem';
import { confirmAction, showAlert } from '../../lib/alert';
import { COMMENTS_PAGE_SIZE, COMMENT_MAX, Comment, addComment, deleteComment, fetchComments } from '../../lib/comments';
import { FeedPost, deletePost, fetchPost, timeAgo } from '../../lib/posts';
import { usePagedList } from '../../lib/usePagedList';
import { useAuth } from '../../providers/AuthProvider';

// Detalle de una publicación: la publicación arriba, sus comentarios debajo
// (más nuevos primero, con scroll infinito) y la caja para comentar abajo.
// Si es mía, botón "Borrar" en la cabecera.
export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = session?.user.id;

  // undefined = cargando; null = no existe (borrada, o enlace viejo)
  const [post, setPost] = useState<FeedPost | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const comments = usePagedList<Comment>({
    fetchPage: (last) => fetchComments(id, last),
    pageSize: COMMENTS_PAGE_SIZE,
    keyOf: (c) => c.id,
  });
  const { reload } = comments;

  useEffect(() => {
    if (!id) return;
    let active = true;
    fetchPost(id)
      .then((p) => active && setPost(p))
      .catch((e) => active && setError(e.message));
    reload({ clear: true });
    return () => {
      active = false;
    };
  }, [id, reload]);

  const isMine = !!post && post.author_id === me;

  async function send() {
    const body = text.trim();
    if (!me || !post || !body || sending) return;
    setSending(true);
    try {
      const created = await addComment(me, post.id, body);
      // No es optimista (esperamos a la BD): el comentario necesita el id y
      // la fecha reales para poder borrarlo y paginar bien. Va arriba del
      // todo porque la lista está ordenada de más nuevo a más antiguo.
      comments.update((list) => [created, ...list]);
      setPost((p) => p && { ...p, comment_count: p.comment_count + 1 });
      setText('');
    } catch (e: any) {
      showAlert('No se pudo comentar', e.message);
    } finally {
      setSending(false);
    }
  }

  function confirmDeleteComment(c: Comment) {
    confirmAction('Borrar comentario', 'No se puede deshacer.', 'Borrar', async () => {
      try {
        await deleteComment(c.id);
        comments.update((list) => list.filter((x) => x.id !== c.id));
        setPost((p) => p && { ...p, comment_count: Math.max(0, p.comment_count - 1) });
      } catch (e: any) {
        showAlert('No se pudo borrar', e.message);
      }
    });
  }

  function report(kind: 'post' | 'comment', targetId: string) {
    router.push({ pathname: '/report', params: { kind, id: targetId } });
  }

  function confirmDeletePost() {
    if (!post) return;
    confirmAction('Borrar publicación', 'No se puede deshacer.', 'Borrar', async () => {
      try {
        await deletePost(post);
        router.back();
      } catch (e: any) {
        showAlert('No se pudo borrar', e.message);
      }
    });
  }

  if (error || post === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {error ? `No se pudo cargar la publicación: ${error}` : 'Esta publicación ya no existe.'}
        </Text>
      </View>
    );
  }

  if (!post) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // La pantalla empieza debajo de la cabecera: hay que descontarla para
      // que la caja de texto quede justo encima del teclado
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 44 : 0}
    >
      <Stack.Screen
        options={{
          title: 'Publicación',
          headerRight: () =>
            isMine ? (
              <Pressable onPress={confirmDeletePost} hitSlop={8}>
                <Text style={styles.danger}>Borrar</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => report('post', post.id)} hitSlop={8}>
                <Text style={styles.danger}>Denunciar</Text>
              </Pressable>
            ),
        }}
      />

      <FlatList
        data={comments.items ?? []}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <>
            <FeedItem post={post} inDetail />
            <Text style={styles.sectionTitle}>Comentarios</Text>
          </>
        }
        renderItem={({ item }) => (
          <CommentRow
            comment={item}
            // Puede borrar el autor del comentario o el dueño del post (es la
            // misma regla que la política comments_delete; aquí solo decide
            // si se enseña el botón, quien manda es la BD)
            onDelete={item.author_id === me || isMine ? () => confirmDeleteComment(item) : undefined}
            onReport={item.author_id !== me ? () => report('comment', item.id) : undefined}
          />
        )}
        ListEmptyComponent={
          comments.error ? (
            <Text style={styles.empty}>Error: {comments.error}</Text>
          ) : !comments.items ? (
            <ActivityIndicator style={{ margin: 16 }} />
          ) : (
            <Text style={styles.empty}>Todavía no hay comentarios. Sé el primero.</Text>
          )
        }
        ListFooterComponent={comments.loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : undefined}
        onEndReached={comments.loadMore}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      />

      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Escribe un comentario…"
          maxLength={COMMENT_MAX}
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

function CommentRow({
  comment,
  onDelete,
  onReport,
}: {
  comment: Comment;
  onDelete?: () => void;
  onReport?: () => void;
}) {
  const router = useRouter();
  const name = comment.author.display_name || comment.author.username;
  const openAuthor = () => router.push({ pathname: '/user/[id]', params: { id: comment.author_id } });

  return (
    <View style={styles.comment}>
      <Pressable onPress={openAuthor}>
        <Avatar path={comment.author.avatar_path} name={name} size={32} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.body}>
          <Text style={styles.username} onPress={openAuthor}>{comment.author.username} </Text>
          {comment.body}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.muted}>{timeAgo(comment.created_at)}</Text>
          {onDelete && (
            <Text style={styles.muted} onPress={onDelete}>
              Borrar
            </Text>
          )}
          {onReport && (
            <Text style={styles.muted} onPress={onReport}>
              Denunciar
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: '#666', fontSize: 12 },
  danger: { color: '#c00', fontSize: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 12, paddingBottom: 4 },
  empty: { color: '#666', textAlign: 'center', margin: 16 },
  comment: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  body: { fontSize: 15, lineHeight: 20 },
  username: { fontWeight: '600' },
  meta: { flexDirection: 'row', gap: 14 },
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
    maxHeight: 100,
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
