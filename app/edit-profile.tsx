import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import {
  DISCIPLINES,
  LIMITS,
  MAX_DISCIPLINES,
  MAX_STYLES,
  emptyToNull,
  fetchProfile,
  normalizeLink,
  parseStyles,
  updateProfile,
} from '../lib/profile';
import { showAlert } from '../lib/alert';
import { useAuth } from '../providers/AuthProvider';

export default function EditProfileScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const userId = session?.user.id;

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  // En el formulario todo es texto; se convierte a lo que espera la tabla al guardar
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [city, setCity] = useState('');
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [stylesText, setStylesText] = useState('');
  const [availability, setAvailability] = useState('');
  const [services, setServices] = useState('');
  const [contactLink, setContactLink] = useState('');

  useEffect(() => {
    if (!userId) return;
    fetchProfile(userId)
      .then((p) => {
        setDisplayName(p.display_name ?? '');
        setBio(p.bio ?? '');
        setCity(p.city ?? '');
        setDisciplines(p.disciplines);
        setStylesText(p.styles.join(', '));
        setAvailability(p.availability ?? '');
        setServices(p.services_text ?? '');
        setContactLink(p.contact_link ?? '');
        setLoaded(true);
      })
      .catch((e) => showAlert('No se pudo cargar el perfil', e.message));
  }, [userId]);

  function toggleDiscipline(key: string) {
    setDisciplines((current) => {
      if (current.includes(key)) return current.filter((d) => d !== key);
      if (current.length >= MAX_DISCIPLINES) {
        showAlert('Demasiadas disciplinas', `Elige como máximo ${MAX_DISCIPLINES}.`);
        return current;
      }
      return [...current, key];
    });
  }

  async function handleSave() {
    if (!userId) return;

    const styles = parseStyles(stylesText);
    if (styles.length > MAX_STYLES) {
      return showAlert('Demasiados estilos', `Pon como máximo ${MAX_STYLES}.`);
    }

    setSaving(true);
    try {
      await updateProfile(userId, {
        display_name: emptyToNull(displayName),
        bio: emptyToNull(bio),
        city: emptyToNull(city),
        disciplines,
        styles,
        availability: emptyToNull(availability),
        services_text: emptyToNull(services),
        contact_link: normalizeLink(contactLink),
      });
      router.back();
    } catch (e: any) {
      // Si algo se cuela por la app, el CHECK de la base de datos lo para aquí
      showAlert('No se pudo guardar', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Field label="Nombre" value={displayName} onChangeText={setDisplayName}
          maxLength={LIMITS.display_name} placeholder="Cómo quieres que te vean" />

        <Field label="Bio" value={bio} onChangeText={setBio} multiline
          maxLength={LIMITS.bio} placeholder="Cuéntate en pocas líneas" />

        <Field label="Ciudad" value={city} onChangeText={setCity}
          maxLength={LIMITS.city} placeholder="Madrid" />

        <View style={{ gap: 6 }}>
          <Text style={s.label}>Disciplinas</Text>
          <View style={s.chips}>
            {DISCIPLINES.map((d) => {
              const on = disciplines.includes(d.key);
              return (
                <Pressable key={d.key} onPress={() => toggleDiscipline(d.key)}
                  style={[s.chip, on && s.chipOn]}>
                  <Text style={on ? { color: '#fff' } : undefined}>{d.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Field label="Estilos (separados por comas)" value={stylesText}
          onChangeText={setStylesText} autoCapitalize="none"
          placeholder="hip hop, popping, house" />

        <Field label="Disponibilidad" value={availability} onChangeText={setAvailability}
          multiline maxLength={LIMITS.availability} placeholder="Fines de semana, giras en verano..." />

        <Field label="Servicios" value={services} onChangeText={setServices} multiline
          maxLength={LIMITS.services_text} placeholder="Clases particulares, coreografías, bolos..." />

        <Field label="Enlace de contacto" value={contactLink} onChangeText={setContactLink}
          autoCapitalize="none" keyboardType="url" maxLength={LIMITS.contact_link}
          placeholder="instagram.com/tuusuario" />

        <Pressable style={[s.button, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Guardar</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={[s.input, props.multiline && s.multiline]} {...props} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, gap: 16 },
  label: { fontWeight: '600', color: '#333' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 16 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: { backgroundColor: '#111', borderColor: '#111' },
  button: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
