import { useRouter } from 'expo-router';
import { ReactElement } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text } from 'react-native';
import { publicUrl } from '../lib/media';
import { Post } from '../lib/posts';
import { usePagedList } from '../lib/usePagedList';

// Una casilla de la cuadrícula (perfil y explorar). Al tocar, el detalle de
// la publicación (comentarios y, si es mía, el botón de borrar).
export function PostTile({ post }: { post: Post }) {
  const router = useRouter();
  return (
    <Pressable
      style={styles.tile}
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
    >
      <Image source={{ uri: publicUrl('posts', post.media_path) }} style={styles.tileImage} />
    </Pressable>
  );
}

// Cuadrícula de 3 columnas de un perfil, con scroll infinito.
//
// Es una FlatList (antes era un ScrollView con todas las fotos dentro)
// porque una FlatList solo pinta lo que se ve y permite pedir más al llegar
// al final. Por eso la cabecera del perfil y lo de abajo (ajustes,
// bloquear...) entran como header/footer de la lista: dentro de un
// ScrollView, una FlatList no puede saber cuándo llegas a su final.
export function PostGrid({
  list,
  header,
  footer,
  emptyText = 'Todavía no hay publicaciones.',
  hidden = false,
}: {
  list: ReturnType<typeof usePagedList<Post>>;
  header: ReactElement;
  footer?: ReactElement;
  emptyText?: string;
  hidden?: boolean; // p. ej. perfil bloqueado: solo cabecera y pie
}) {
  return (
    <FlatList
      data={hidden ? [] : (list.items ?? [])}
      keyExtractor={(p) => p.id}
      numColumns={3}
      renderItem={({ item }) => <PostTile post={item} />}
      ListHeaderComponent={header}
      ListHeaderComponentStyle={styles.header}
      ListEmptyComponent={
        hidden ? undefined : list.error ? (
          <Text style={styles.muted}>No se pudieron cargar las publicaciones: {list.error}</Text>
        ) : !list.items ? (
          <ActivityIndicator style={{ margin: 16 }} />
        ) : (
          <Text style={styles.muted}>{emptyText}</Text>
        )
      }
      ListFooterComponent={
        <>
          {list.loadingMore && <ActivityIndicator style={{ margin: 16 }} />}
          {footer}
        </>
      }
      onEndReached={hidden ? undefined : list.loadMore}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.container}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  header: { marginBottom: 14 },
  muted: { color: '#666', textAlign: 'center', padding: 16 },
  tile: { width: '33.333%', aspectRatio: 1, padding: 1 },
  tileImage: { flex: 1, backgroundColor: '#eee' },
});
