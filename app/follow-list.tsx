import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { ProfileRow } from '../components/ProfileRow';
import { FollowListKind, fetchFollowList } from '../lib/follows';
import { ProfileSummary } from '../lib/profile';

// Seguidores o seguidos de un usuario (?userId=...&kind=followers|following)
export default function FollowListScreen() {
  const { userId, kind } = useLocalSearchParams<{ userId: string; kind: FollowListKind }>();
  const [people, setPeople] = useState<ProfileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchFollowList(userId, kind === 'following' ? 'following' : 'followers')
      .then((list) => active && setPeople(list))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [userId, kind]);

  const title = kind === 'following' ? 'Siguiendo' : 'Seguidores';

  return (
    <>
      <Stack.Screen options={{ title }} />
      {error ? (
        <View style={styles.center}>
          <Text style={styles.muted}>No se pudo cargar: {error}</Text>
        </View>
      ) : !people ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <ProfileRow profile={item} />}
          ListEmptyComponent={<Text style={[styles.muted, styles.empty]}>Nadie todavía.</Text>}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: '#666' },
  empty: { textAlign: 'center', padding: 24 },
});
