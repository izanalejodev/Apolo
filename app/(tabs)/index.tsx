import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FeedItem } from '../../components/FeedItem';
import { FEED_PAGE_SIZE, FeedPost, fetchFeed } from '../../lib/posts';

// Pestaña "Inicio": feed cronológico de a quién sigo (y mis posts).
// Scroll infinito: al acercarse al final se pide la página siguiente.
export default function FeedScreen() {
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[] | null>(null); // null = primera carga
  const [hasMore, setHasMore] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref y no estado: onEndReached puede dispararse varias veces seguidas
  // antes de que React repinte, y un estado aún no estaría actualizado.
  const busy = useRef(false);

  // Primera página (al entrar o al tirar hacia abajo para refrescar)
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const page = await fetchFeed(null);
      setPosts(page);
      setHasMore(page.length === FEED_PAGE_SIZE);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      busy.current = false;
    }
  }, []);

  // No recargamos cada vez que vuelves a la pestaña (perderías por dónde
  // ibas, como pasaría en Instagram). Solo si aún está vacío: así, si
  // acabas de seguir a alguien desde un feed vacío, al volver ya aparece.
  useFocusEffect(
    useCallback(() => {
      if (!posts || posts.length === 0) refresh();
    }, [posts, refresh])
  );

  async function onPullToRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function loadMore() {
    if (busy.current || !hasMore || !posts || posts.length === 0) return;
    busy.current = true;
    setLoadingMore(true);
    try {
      const last = posts[posts.length - 1];
      const page = await fetchFeed({ created_at: last.created_at, id: last.id });
      // Por si acaso, sin duplicados (la key de FlatList debe ser única)
      setPosts((prev) => {
        const seen = new Set((prev ?? []).map((p) => p.id));
        return [...(prev ?? []), ...page.filter((p) => !seen.has(p.id))];
      });
      setHasMore(page.length === FEED_PAGE_SIZE);
    } catch (e: any) {
      setError(e.message);
    } finally {
      busy.current = false;
      setLoadingMore(false);
    }
  }

  if (!posts) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.muted}>No se pudo cargar el feed: {error}</Text> : <ActivityIndicator size="large" />}
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <FeedItem post={item} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5} // pedir más cuando falte media pantalla
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullToRefresh} />}
      contentContainerStyle={posts.length === 0 ? { flex: 1 } : undefined}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Tu feed está vacío</Text>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            Sigue a otros artistas para ver aquí lo que publican.
          </Text>
          <Pressable style={styles.button} onPress={() => router.push('/search')}>
            <Text style={styles.buttonText}>Buscar gente</Text>
          </Pressable>
        </View>
      }
      ListFooterComponent={
        loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : error ? (
          <Text style={[styles.muted, { textAlign: 'center', margin: 16 }]}>Error: {error}</Text>
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
