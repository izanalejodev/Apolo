import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

// Misma regla que el CHECK de la tabla profiles
const USERNAME_REGEX = /^[a-z0-9_.]{3,30}$/;

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function handleSubmit() {
    if (!email.trim() || !password) {
      return Alert.alert('Faltan datos', 'Escribe tu email y contraseña.');
    }

    if (isSignup) {
      const clean = username.trim().toLowerCase();
      if (!USERNAME_REGEX.test(clean)) {
        return Alert.alert(
          'Nombre de usuario no válido',
          'Entre 3 y 30 caracteres: letras minúsculas, números, punto o guion bajo.'
        );
      }
      if (password.length < 6) {
        return Alert.alert('Contraseña corta', 'Usa al menos 6 caracteres.');
      }
    }

    setBusy(true);

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // El trigger de la base de datos usa este dato para crear el perfil
        options: { data: { username: username.trim().toLowerCase() } },
      });

      if (error) {
        Alert.alert('No se pudo crear la cuenta', friendlyError(error.message));
      } else if (!data.session) {
        // Pasa cuando "Confirm email" está activado en Supabase
        Alert.alert('Revisa tu email', 'Te hemos enviado un enlace para confirmar tu cuenta.');
      }
      // Si hay sesión, AuthGate redirige solo
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) Alert.alert('No se pudo iniciar sesión', friendlyError(error.message));
    }

    setBusy(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>{isSignup ? 'Crear cuenta' : 'Iniciar sesión'}</Text>

      {isSignup && (
        <TextInput
          style={styles.input}
          placeholder="Nombre de usuario"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Contraseña"
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.buttonText}>{isSignup ? 'Registrarme' : 'Entrar'}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => setMode(isSignup ? 'login' : 'signup')} disabled={busy}>
        <Text style={styles.switch}>
          {isSignup ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

// Traduce los errores más habituales
function friendlyError(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('already registered')) return 'Ya existe una cuenta con ese email.';
  if (m.includes('database error saving new user')) {
    return 'Ese nombre de usuario ya está cogido o no es válido.';
  }
  return message;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switch: { textAlign: 'center', marginTop: 12, color: '#555' },
});
