import { useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '../lib/alert';
import { APP_NAME, OWNER } from '../lib/legal';
import { unregisterPush } from '../lib/push';
import { supabase } from '../lib/supabase';

// Ajustes: lo que no es "mi perfil" pero tiene que estar fácil de encontrar.
// Apple revisa expresamente que eliminar la cuenta y el contacto estén a
// la vista (no escondidos en una web).
export default function SettingsScreen() {
  const router = useRouter();

  function confirmSignOut() {
    // Primero se borra el token de notificaciones (con la sesión aún abierta,
    // que es lo que da permiso): si no, este móvil seguiría recibiendo los
    // mensajes de esta cuenta. Si falla (sin red), se sale igual.
    confirmAction('Cerrar sesión', '¿Seguro que quieres salir?', 'Salir', async () => {
      await unregisterPush().catch(() => {});
      await supabase.auth.signOut();
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Privacidad y seguridad">
        <Row label="Cuentas bloqueadas" onPress={() => router.push('/blocked')} />
      </Section>

      <Section title="Información">
        <Row label="Términos de uso" onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })} />
        <Row
          label="Política de privacidad"
          onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
        />
        <Row
          label="Contacto y ayuda"
          detail={OWNER.email}
          onPress={() => Linking.openURL(`mailto:${OWNER.email}?subject=${encodeURIComponent(APP_NAME)}`)}
        />
      </Section>

      <Section title="Cuenta">
        <Row label="Cerrar sesión" onPress={confirmSignOut} />
        <Row label="Eliminar cuenta" danger onPress={() => router.push('/delete-account')} />
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  label,
  detail,
  danger,
  onPress,
}: {
  label: string;
  detail?: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={[styles.label, danger && styles.danger]}>{label}</Text>
      {detail ? (
        <Text style={styles.detail} numberOfLines={1}>
          {detail}
        </Text>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase', paddingHorizontal: 8 },
  card: { borderRadius: 12, backgroundColor: '#f4f4f4', overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  label: { fontSize: 16 },
  danger: { color: '#c00' },
  detail: { color: '#666', flexShrink: 1 },
  chevron: { color: '#999', fontSize: 20 },
});
