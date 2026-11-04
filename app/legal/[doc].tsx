import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LEGAL_DOCS, LegalDocKey } from '../../lib/legal';

// /legal/terms y /legal/privacy. Ruta pública: se puede abrir sin sesión
// (desde el registro) y, en la versión web, es la URL para las tiendas.
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = doc && doc in LEGAL_DOCS ? LEGAL_DOCS[doc as LegalDocKey] : null;

  if (!content) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: '' }} />
        <Text style={styles.muted}>Documento no encontrado.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: content.title }} />
      <Text style={styles.title}>{content.title}</Text>
      <Text style={styles.muted}>Última actualización: {content.updated}</Text>
      {content.sections.map((s) => (
        <View key={s.heading} style={{ gap: 6 }}>
          <Text style={styles.heading}>{s.heading}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 24, gap: 18, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '700' },
  muted: { color: '#666' },
  heading: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, color: '#222' },
});
