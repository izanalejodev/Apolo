import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { showAlert } from '../lib/alert';
import { PickedImage, pickImage } from '../lib/media';
import { CAPTION_MAX, createImagePost } from '../lib/posts';
import { useAuth } from '../providers/AuthProvider';

export default function NewPostScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const [image, setImage] = useState<PickedImage | null>(null);
  const [caption, setCaption] = useState('');
  const [publishing, setPublishing] = useState(false);

  async function choose() {
    const picked = await pickImage();
    if (picked) setImage(picked);
  }

  async function publish() {
    if (!session || !image) return;
    setPublishing(true);
    try {
      await createImagePost(session.user.id, image, caption);
      router.back(); // el perfil recarga solo al volver (useFocusEffect)
    } catch (e: any) {
      showAlert('No se pudo publicar', e.message);
    } finally {
      setPublishing(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
        <Pressable onPress={choose} disabled={publishing}>
          {image ? (
            <Image
              source={{ uri: image.uri }}
              // Respetar la proporción de la foto (vertical, horizontal...)
              style={[s.preview, { aspectRatio: image.width && image.height ? image.width / image.height : 1 }]}
            />
          ) : (
            <Text style={s.placeholder}>Toca para elegir una foto</Text>
          )}
        </Pressable>

        {image && (
          <Pressable onPress={choose} disabled={publishing}>
            <Text style={s.change}>Cambiar foto</Text>
          </Pressable>
        )}

        <TextInput
          style={s.input}
          placeholder="Escribe un pie de foto..."
          value={caption}
          onChangeText={setCaption}
          multiline
          maxLength={CAPTION_MAX}
          editable={!publishing}
        />

        <Pressable
          style={[s.button, (!image || publishing) && { opacity: 0.5 }]}
          onPress={publish}
          disabled={!image || publishing}
        >
          {publishing ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Publicar</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { padding: 24, gap: 14 },
  preview: { width: '100%', borderRadius: 10, backgroundColor: '#eee' },
  placeholder: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#aaa',
    borderRadius: 10,
    paddingVertical: 80,
    textAlign: 'center',
    color: '#666',
  },
  change: { textAlign: 'center', color: '#0a66c2' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  button: { backgroundColor: '#111', borderRadius: 10, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
