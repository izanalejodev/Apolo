import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { ProfileRow } from '../components/ProfileRow';
import { LIKERS_PAGE_SIZE, Liker, fetchLikers } from '../lib/likes';
import { usePagedList } from '../lib/usePagedList';

// Quién ha dado like a una publicación (?postId=...), más recientes primero
export default function LikesScreen() {
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const likers = usePagedList<Liker>({
    fetchPage: (last) => fetchLikers(postId, last),
    pageSize: LIKERS_PAGE_SIZE,
    keyOf: (l) => l.id,
  });
  const { reload } = likers;

  useEffect(() => {
    if (postId) reload({ clear: true });
  }, [postId, reload]);

  if (!likers.items) {
    return (
      <View style={styles.center}>
        {likers.error ? (
          <Text style={styles.muted}>No se pudo cargar: {likers.error}</Text>
        ) : (
          <ActivityIndicator size="large" />
        )}
      </View>
    );
  }

  return (
    <FlatList
      data={likers.items}
      keyExtractor={(l) => l.id}
      renderItem={({ item }) => <ProfileRow profile={item} />}
      onEndReached={likers.loadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={<Text style={[styles.muted, styles.empty]}>Nadie todavía.</Text>}
      ListFooterComponent={likers.loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : undefined}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: '#666' },
  empty: { textAlign: 'center', padding: 24 },
});
