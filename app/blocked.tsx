import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileRow } from '../components/ProfileRow';
import { confirmAction, showAlert } from '../lib/alert';
import { fetchBlockedUsers, unblockUser } from '../lib/moderation';
import { ProfileSummary } from '../lib/profile';
import { useAuth } from '../providers/AuthProvider';

// Mis cuentas bloqueadas. Hace falta porque la búsqueda ya no las enseña:
// sin esta lista no habría forma de encontrarlas para desbloquear.
export default function BlockedScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [people, setPeople] = useState<ProfileSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!me) return;
    let active = true;
    fetchBlockedUsers(me)
      .then((list) => active && setPeople(list))
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [me]);

  function confirmUnblock(p: ProfileSummary) {
    if (!me) return;
    confirmAction(
      `Desbloquear a @${p.username}`,
      'Podréis volver a ver vuestras publicaciones y escribiros. No volveréis a seguiros solos.',
      'Desbloquear',
      async () => {
        try {
          await unblockUser(me, p.id);
          setPeople((list) => list && list.filter((x) => x.id !== p.id));
        } catch (e: any) {
          showAlert('No se pudo desbloquear', e.message);
        }
      }
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No se pudo cargar: {error}</Text>
      </View>
    );
  }

  if (!people) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <FlatList
      data={people}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ProfileRow profile={item} />
          </View>
          <Pressable style={styles.button} onPress={() => confirmUnblock(item)}>
            <Text style={styles.buttonText}>Desbloquear</Text>
          </Pressable>
        </View>
      )}
      ListEmptyComponent={<Text style={[styles.muted, styles.empty]}>No has bloqueado a nadie.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  muted: { color: '#666' },
  empty: { textAlign: 'center', padding: 24 },
  row: { flexDirection: 'row', alignItems: 'center', paddingRight: 16 },
  button: { borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  buttonText: { fontWeight: '600' },
});
