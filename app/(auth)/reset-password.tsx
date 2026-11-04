import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { Field } from '../../components/Field';
import { showAlert } from '../../lib/alert';
import { friendlyAuthError } from '../../lib/authErrors';
import { supabase } from '../../lib/supabase';

const RESEND_SECONDS = 60; // Supabase no deja pedir otro antes (por email)

// Recuperar contraseña con un CÓDIGO por email, no con un enlace.
//
// Por qué un código: un enlace tendría que volver a abrir la app (deep
// link "apolo://..."), y eso falla en muchos casos normales: abres el email
// en el ordenador y la app está en el móvil, o estás en Expo Go (que usa
// otro esquema), o el cliente de correo abre el enlace en su navegador
// interno. Un código de 6 dígitos se copia de cualquier sitio y funciona
// igual en móvil y en web.
//
// Pasos:
//  1. resetPasswordForEmail(email) -> Supabase manda el código.
//  2. verifyOtp(email, código, 'recovery') -> abre sesión.
//  3. updateUser({ password }) -> cambia la contraseña.
// El 2 y el 3 van en el mismo botón: si fueran pantallas separadas, al
// abrirse la sesión en el paso 2 AuthGate ya te mandaría dentro de la app
// sin haber puesto la contraseña nueva. (AuthGate deja esta pantalla en paz
// aunque haya sesión; al terminar, nos vamos a la app nosotros.)
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const router = useRouter();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0); // segundos para poder reenviar

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function sendCode() {
    const clean = email.trim();
    if (!clean) return showAlert('Falta el email', 'Escribe el email de tu cuenta.');
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(clean);
    setBusy(false);
    if (error) return showAlert('No se pudo enviar el código', friendlyAuthError(error.message));
    // Supabase responde lo mismo exista o no la cuenta, a propósito: si
    // dijera "no existe", cualquiera podría comprobar qué emails están
    // registrados. Por eso el mensaje es "si existe..."
    setStep('code');
    setCooldown(RESEND_SECONDS);
  }

  async function submit() {
    if (password.length < 6) return showAlert('Contraseña corta', 'Usa al menos 6 caracteres.');
    if (password !== repeat) return showAlert('No coinciden', 'Las dos contraseñas tienen que ser iguales.');

    // Un código solo vale una vez. Si un intento anterior ya lo verificó (y
    // falló solo el cambio de contraseña, p. ej. por ser igual que la
    // vieja), ya hay sesión: no se vuelve a verificar, solo se reintenta
    // updateUser.
    const { data } = await supabase.auth.getSession();
    const token = code.replace(/\s/g, '');
    if (!data.session && !/^\d{6,10}$/.test(token)) {
      return showAlert('Código no válido', 'Escribe el código de números que te hemos enviado.');
    }

    setBusy(true);
    try {
      if (!data.session) {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token, type: 'recovery' });
        if (error) throw error;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showAlert('Contraseña cambiada', 'Ya has iniciado sesión con tu contraseña nueva.');
      router.replace('/');
    } catch (e: any) {
      showAlert('No se pudo cambiar la contraseña', friendlyAuthError(e.message));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#fff' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {step === 'email' ? (
          <>
            <Text style={styles.text}>
              Escribe el email de tu cuenta y te enviaremos un código para elegir una contraseña nueva.
            </Text>
            <Field
              label="Email"
              placeholder="tu@email.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Pressable style={[styles.button, busy && styles.disabled]} onPress={sendCode} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Enviar código</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.text}>
              Si existe una cuenta con <Text style={styles.bold}>{email.trim()}</Text>, te hemos enviado un código.
              Mira también en spam.
            </Text>
            <Field
              label="Código del email"
              style={styles.code}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code" // Android: sugiere el código
              textContentType="oneTimeCode" // iOS: sugiere el código del email
              maxLength={10}
              value={code}
              onChangeText={setCode}
            />
            <Field
              label="Contraseña nueva"
              placeholder="Mínimo 6 caracteres"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
            />
            <Field
              label="Repite la contraseña nueva"
              placeholder="La misma otra vez"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              value={repeat}
              onChangeText={setRepeat}
            />
            <Pressable style={[styles.button, busy && styles.disabled]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Cambiar contraseña</Text>}
            </Pressable>

            <Pressable onPress={sendCode} disabled={busy || cooldown > 0}>
              <Text style={styles.secondary}>
                {cooldown > 0 ? `Reenviar código (${cooldown} s)` : 'Reenviar código'}
              </Text>
            </Pressable>
            <Pressable onPress={() => setStep('email')} disabled={busy}>
              <Text style={styles.secondary}>Cambiar de email</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12 },
  text: { fontSize: 15, lineHeight: 22, color: '#333' },
  bold: { fontWeight: '700' },
  code: { fontSize: 22, letterSpacing: 6, textAlign: 'center' },
  button: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 4 },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { textAlign: 'center', color: '#555', padding: 8 },
});
