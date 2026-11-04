import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FeedItem } from '../../components/FeedItem';
import { FEED_PAGE_SIZE, FeedPost, fetchFeed } from '../../lib/posts';
import { usePagedList } from '../../lib/usePagedList';

// Pestaña "Inicio": feed cronológico de a quién sigo (y mis posts).
// Scroll infinito: al acercarse al final se pide la página siguiente.
export default function FeedScreen() {
  const router = useRouter();
  const feed = usePagedList<FeedPost>({
    fetchPage: (last) => fetchFeed(last && { created_at: last.created_at, id: last.id }),
    pageSize: FEED_PAGE_SIZE,
    keyOf: (p) => p.id,
  });
  const { reload, isEmpty } = feed;

  // No recargamos cada vez que vuelves a la pestaña (perderías por dónde
  // ibas). Solo si está vacío: la primera vez y, si acabas de seguir a
  // alguien desde un feed vacío, al volver ya aparece.
  // isEmpty lee un ref, así que este efecto solo corre al enfocar la
  // pantalla y no cada vez que cambia la lista.
  useFocusEffect(
    useCallback(() => {
      if (isEmpty()) reload();
    }, [isEmpty, reload])
  );

  if (!feed.items) {
    return (
      <View style={styles.center}>
        {feed.error ? (
          <Text style={styles.muted}>No se pudo cargar el feed: {feed.error}</Text>
        ) : (
          <ActivityIndicator size="large" />
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={feed.items}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <FeedItem post={item} />}
      onEndReached={feed.loadMore}
      onEndReachedThreshold={0.5} // pedir más cuando falte media pantalla
      refreshControl={<RefreshControl refreshing={feed.refreshing} onRefresh={feed.pullToRefresh} />}
      contentContainerStyle={feed.items.length === 0 ? { flex: 1 } : undefined}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Tu feed está vacío</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Sigue a otros artistas para ver aquí lo que publican.
          </Text>
          <Pressable style={styles.button} onPress={() => router.push('/explore')}>
            <Text style={styles.buttonText}>Explorar</Text>
          </Pressable>
        </View>
      }
      ListFooterComponent={
        feed.loadingMore ? (
          <ActivityIndicator style={{ margin: 16 }} />
        ) : feed.error ? (
          <Text style={[styles.muted, { textAlign: 'center', margin: 16 }]}>Error: {feed.error}</Text>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  muted: { color: '#666' },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  button: { backgroundColor: '#111', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20, marginTop: 8 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
