import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// Píldora seleccionable (filtros de explorar)
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

type Option = { value: string; label: string };

// Fila con scroll horizontal: "Ciudad  [Madrid] [Cádiz] [Sevilla] ..."
// Se elige como mucho uno; tocar el elegido lo quita.
export function ChipRow({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: Option[];
  selected: string | null;
  onToggle: (value: string) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rowChips}>
        {options.map((o) => (
          <Chip key={o.value} label={o.label} selected={selected === o.value} onPress={() => onToggle(o.value)} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipSelected: { backgroundColor: '#111', borderColor: '#111' },
  text: { fontSize: 14, color: '#111' },
  textSelected: { color: '#fff' },
  row: { gap: 6 },
  rowLabel: { fontSize: 12, fontWeight: '700', color: '#666', textTransform: 'uppercase', paddingHorizontal: 16 },
  rowChips: { gap: 8, paddingHorizontal: 16 },
});
