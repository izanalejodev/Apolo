import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { ProfileRow } from '../../components/ProfileRow';
import { ProfileSummary, searchProfiles } from '../../lib/profile';
import { useAuth } from '../../providers/AuthProvider';

// Buscar personas por @usuario o nombre. Provisional: en el paso 4 (explorar)
// se añaden los filtros por ciudad, disciplina y estilo.
export default function SearchScreen() {
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [results, setResults] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounce: esperamos 300 ms desde la última tecla antes de buscar. Si no,
  // escribir "popping" lanzaría 7 consultas, y podrían llegar desordenadas
  // (la de "pop" después de la de "popping") y mostrar resultados viejos.
  // El cleanup cancela el temporizador pendiente y marca la búsqueda anterior
  // como obsoleta para ignorar su respuesta si llega tarde.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      if (text.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const found = await searchProfiles(text);
        if (!active) return;
        // No me muestro a mí mismo
        setResults(found.filter((p) => p.id !== session?.user.id));
        setError(null);
      } catch (e: any) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading(false);
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [text]);

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={styles.input}
        placeholder="Buscar por @usuario o nombre"
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="while-editing"
      />
      {loading && <ActivityIndicator style={{ marginTop: 16 }} />}
      {error && <Text style={[styles.muted, styles.empty]}>Error al buscar: {error}</Text>}
      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <ProfileRow profile={item} />}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading && text.trim().length >= 2 ? (
            <Text style={[styles.muted, styles.empty]}>Nadie con ese nombre.</Text>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    margin: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  muted: { color: '#666' },
  empty: { textAlign: 'center', padding: 24 },
});
