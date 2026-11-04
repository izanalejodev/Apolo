import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { showAlert } from '../lib/alert';
import {
  REPORT_DETAILS_MAX,
  REPORT_KIND_LABEL,
  REPORT_REASONS,
  ReportKind,
  ReportReason,
  reportContent,
} from '../lib/moderation';
import { INPUT_COLORS } from '../components/Field';

const KINDS = Object.keys(REPORT_KIND_LABEL) as ReportKind[];

// Denunciar algo: /report?kind=post|comment|message|profile&id=...
// Una pantalla y no un Alert porque hay que elegir entre 7 motivos (y en
// web un Alert con opciones no funciona).
export default function ReportScreen() {
  const params = useLocalSearchParams<{ kind: string; id: string }>();
  const router = useRouter();
  const kind = KINDS.includes(params.kind as ReportKind) ? (params.kind as ReportKind) : null;

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!kind || !params.id || !reason || sending) return;
    setSending(true);
    try {
      await reportContent(kind, params.id, reason, details);
      showAlert('Gracias por avisar', 'Revisaremos la denuncia lo antes posible. Quien la recibe no sabe que has sido tú.');
      router.back();
    } catch (e: any) {
      showAlert('No se pudo enviar la denuncia', e.message);
      setSending(false);
    }
  }

  if (!kind || !params.id) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No hay nada que denunciar aquí.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: `Denunciar ${REPORT_KIND_LABEL[kind]}` }} />
      <Text style={styles.title}>¿Qué pasa con este {REPORT_KIND_LABEL[kind]}?</Text>

      <View>
        {REPORT_REASONS.map((r) => (
          <Pressable key={r.key} style={styles.option} onPress={() => setReason(r.key)}>
            <View style={[styles.radio, reason === r.key && styles.radioOn]} />
            <Text style={styles.optionText}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput
        style={styles.input}
        placeholderTextColor={INPUT_COLORS.placeholder}
        value={details}
        onChangeText={setDetails}
        placeholder="Cuéntanos más (opcional)"
        maxLength={REPORT_DETAILS_MAX}
        multiline
      />

      <Pressable style={[styles.button, (!reason || sending) && styles.buttonDisabled]} onPress={send} disabled={!reason || sending}>
        <Text style={styles.buttonText}>{sending ? 'Enviando…' : 'Enviar denuncia'}</Text>
      </Pressable>

      <Text style={styles.muted}>
        Si alguien te está molestando, también puedes bloquearlo desde su perfil: dejaréis de ver vuestras
        publicaciones y no podrá escribirte.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  container: { padding: 24, gap: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  muted: { color: '#666', lineHeight: 20 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#999' },
  radioOn: { borderColor: '#111', backgroundColor: '#111' },
  optionText: { fontSize: 16 },
  input: {
    color: INPUT_COLORS.text,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  button: { backgroundColor: '#c00', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
