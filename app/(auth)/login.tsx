import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { INPUT_COLORS, inputStyle } from '../../components/Field';
import { showAlert } from '../../lib/alert';
import { friendlyAuthError } from '../../lib/authErrors';
import { MIN_AGE, TERMS_VERSION } from '../../lib/legal';
import { supabase } from '../../lib/supabase';

// Misma regla que el CHECK de la tabla profiles
const USERNAME_REGEX = /^[a-z0-9_.]{3,30}$/;

export default function LoginScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const router = useRouter();

  const isSignup = mode === 'signup';

  async function handleSubmit() {
    if (!email.trim() || !password) {
      return showAlert('Faltan datos', 'Escribe tu email y contraseña.');
    }

    if (isSignup) {
      const clean = username.trim().toLowerCase();
      if (!USERNAME_REGEX.test(clean)) {
        return showAlert(
          'Nombre de usuario no válido',
          'Entre 3 y 30 caracteres: letras minúsculas, números, punto o guion bajo.'
        );
      }
      if (password.length < 6) {
        return showAlert('Contraseña corta', 'Usa al menos 6 caracteres.');
      }
      if (!acceptedTerms) {
        return showAlert('Falta aceptar los términos', 'Marca la casilla para poder crear la cuenta.');
      }
    }

    setBusy(true);

    if (isSignup) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // El trigger de la base de datos usa estos datos para crear el perfil
        // y guardar qué versión de los términos se aceptó (sin ella, falla)
        options: { data: { username: username.trim().toLowerCase(), terms_version: TERMS_VERSION } },
      });

      if (error) {
        showAlert('No se pudo crear la cuenta', friendlyAuthError(error.message));
      } else if (!data.session) {
        // Pasa cuando "Confirm email" está activado en Supabase
        showAlert(
          'Revisa tu email',
          'Te hemos enviado un enlace para confirmar tu cuenta. Después, vuelve aquí e inicia sesión.'
        );
        setMode('login');
      }
      // Si hay sesión, AuthGate redirige solo
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) showAlert('No se pudo iniciar sesión', friendlyAuthError(error.message));
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
          placeholderTextColor={INPUT_COLORS.placeholder}
          placeholder="Nombre de usuario"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
      )}

      <TextInput
        style={styles.input}
        placeholderTextColor={INPUT_COLORS.placeholder}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholderTextColor={INPUT_COLORS.placeholder}
        placeholder="Contraseña"
        secureTextEntry
        autoCapitalize="none"
        value={password}
        onChangeText={setPassword}
      />

      {isSignup && (
        <View style={styles.terms}>
          {/* La casilla y el texto se pulsan por separado: el texto tiene
              enlaces, y tocar un enlace no debe marcar la casilla */}
          <Pressable
            onPress={() => setAcceptedTerms((v) => !v)}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxOn]}>
              {acceptedTerms && <Text style={styles.check}>✓</Text>}
            </View>
          </Pressable>
          <Text style={styles.termsText}>
            Tengo {MIN_AGE} años o más y acepto los{' '}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>
              términos de uso
            </Text>{' '}
            (no se tolera contenido ofensivo ni el acoso) y la{' '}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>
              política de privacidad
            </Text>
            .
          </Text>
        </View>
      )}

      <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleSubmit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.buttonText}>{isSignup ? 'Registrarme' : 'Entrar'}</Text>
        )}
      </Pressable>

      {!isSignup && (
        <Pressable
          onPress={() => router.push({ pathname: '/reset-password', params: { email: email.trim() } })}
          disabled={busy}
        >
          <Text style={styles.switch}>¿Has olvidado tu contraseña?</Text>
        </Pressable>
      )}

      <Pressable onPress={() => setMode(isSignup ? 'login' : 'signup')} disabled={busy}>
        <Text style={styles.switch}>
          {isSignup ? '¿Ya tienes cuenta? Inicia sesión' : '¿No tienes cuenta? Regístrate'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 12 },
  input: inputStyle, // colores explícitos: ver components/Field.tsx
  button: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  switch: { textAlign: 'center', marginTop: 12, color: '#555' },
  terms: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: '#111', borderColor: '#111' },
  check: { color: '#fff', fontSize: 14, fontWeight: '700' },
  termsText: { flex: 1, color: '#444', lineHeight: 20 },
  link: { color: '#0a66c2' },
});
