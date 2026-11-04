import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

// Campo de texto con etiqueta encima.
//
// La etiqueta, y no solo el placeholder: el placeholder desaparece en
// cuanto escribes, y con varios campos parecidos seguidos ("contraseña
// nueva", "repite la contraseña") ya no sabes cuál es cuál.
//
// Colores explícitos (texto, placeholder, fondo): si no se ponen, el sistema
// usa los de su tema, y en modo oscuro pinta el texto claro sobre nuestro
// fondo blanco, así que no se ve nada.
export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={INPUT_COLORS.placeholder} style={[inputStyle, style]} {...props} />
    </View>
  );
}

export const INPUT_COLORS = { text: '#111', placeholder: '#888', background: '#fff' };

// Para los TextInput que no usan Field (p. ej. el login)
export const inputStyle = {
  borderWidth: 1,
  borderColor: '#ccc',
  borderRadius: 10,
  padding: 14,
  fontSize: 16,
  color: INPUT_COLORS.text,
  backgroundColor: INPUT_COLORS.background,
} as const;

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 14, fontWeight: '600', color: '#333' },
});
