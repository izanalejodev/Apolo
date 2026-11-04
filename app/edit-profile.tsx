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
import { Avatar } from '../components/Avatar';
import { pickImage } from '../lib/media';
import {
  AVAILABILITY,
  Availability,
  DISCIPLINES,
  changeAvatar,
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
import { INPUT_COLORS } from '../components/Field';

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
  const [availability, setAvailability] = useState<Availability>('not_looking');
  const [services, setServices] = useState('');
  const [contactLink, setContactLink] = useState('');
  const [username, setUsername] = useState('');
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchProfile(userId)
      .then((p) => {
        setDisplayName(p.display_name ?? '');
        setBio(p.bio ?? '');
        setCity(p.city ?? '');
        setDisciplines(p.disciplines);
        setStylesText(p.styles.join(', '));
        setAvailability(p.availability);
        setServices(p.services_text ?? '');
        setContactLink(p.contact_link ?? '');
        setUsername(p.username);
        setAvatarPath(p.avatar_path);
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

  async function handleChangeAvatar() {
    if (!userId) return;
    const picked = await pickImage({ square: true });
    if (!picked) return;

    setUploadingAvatar(true);
    try {
      setAvatarPath(await changeAvatar(userId, picked, avatarPath));
    } catch (e: any) {
      showAlert('No se pudo cambiar la foto', e.message);
    } finally {
      setUploadingAvatar(false);
    }
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
        availability,
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
        <Pressable onPress={handleChangeAvatar} disabled={uploadingAvatar} style={s.avatar}>
          <Avatar path={avatarPath} name={displayName || username} size={96} />
          {uploadingAvatar ? (
            <ActivityIndicator />
          ) : (
            <Text style={s.avatarText}>Cambiar foto</Text>
          )}
        </Pressable>

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

        <View style={{ gap: 6 }}>
          <Text style={s.label}>Disponibilidad</Text>
          <View style={s.chips}>
            {AVAILABILITY.map((a) => {
              const on = availability === a.key;
              return (
                <Pressable key={a.key} onPress={() => setAvailability(a.key)}
                  style={[s.chip, on && s.chipOn]}>
                  <Text style={on ? { color: '#fff' } : undefined}>{a.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
      <TextInput
        style={[s.input, props.multiline && s.multiline]}
        placeholderTextColor={INPUT_COLORS.placeholder}
        {...props}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, gap: 16 },
  avatar: { alignItems: 'center', gap: 8 },
  avatarText: { color: '#0a66c2' },
  label: { fontWeight: '600', color: '#333' },
  input: { color: INPUT_COLORS.text, borderWidth: 1, borderColor: '#ccc', borderRadius: 10, padding: 12, fontSize: 16 },
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
