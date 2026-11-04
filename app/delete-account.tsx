import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { showAlert } from '../lib/alert';
import { deleteMyAccount } from '../lib/account';
import { fetchProfile } from '../lib/profile';
import { useAuth } from '../providers/AuthProvider';

// Eliminar la cuenta. Pantalla propia (y no un simple "¿Seguro?") porque no
// se puede deshacer: hay que escribir el nombre de usuario para activar el
// botón, así no se borra nadie de un toque sin querer.
export default function DeleteAccountScreen() {
  const { session } = useAuth();
  const me = session?.user.id;
  const [username, setUsername] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!me) return;
    fetchProfile(me)
      .then((p) => setUsername(p.username))
      .catch((e) => showAlert('No se pudo cargar tu perfil', e.message));
  }, [me]);

  const matches = !!username && typed.trim().toLowerCase() === username;

  async function remove() {
    if (!matches || deleting) return;
    setDeleting(true);
    try {
      // Al terminar se cierra la sesión y AuthGate lleva a la pantalla de login
      await deleteMyAccount();
    } catch (e: any) {
      showAlert('No se pudo eliminar la cuenta', e.message);
      setDeleting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Eliminar tu cuenta</Text>
      <Text style={styles.body}>
        Se borrarán para siempre tu perfil, tus publicaciones y fotos, tus comentarios y likes, tus seguidores y
        seguidos, y tus mensajes (también dejarán de verlos las personas con las que hablabas).
      </Text>
      <Text style={styles.body}>No se puede deshacer.</Text>

      {username ? (
        <>
          <Text style={styles.body}>
            Para confirmar, escribe tu nombre de usuario: <Text style={styles.bold}>{username}</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            placeholder={username}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </>
      ) : (
        <ActivityIndicator />
      )}

      <Pressable style={[styles.button, (!matches || deleting) && styles.disabled]} onPress={remove} disabled={!matches || deleting}>
        {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Eliminar mi cuenta</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  title: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, color: '#222' },
  bold: { fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 14, fontSize: 16 },
  button: { backgroundColor: '#c00', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8 },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
