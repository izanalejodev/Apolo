import { Tabs } from 'expo-router/js-tabs';
import { ColorValue, Text } from 'react-native';

// Barra de pestañas inferior. Los iconos son caracteres de texto para no
// añadir una librería de iconos todavía; se cambian cuando haya diseño.
function icon(glyph: string) {
  return ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#111' }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="search" options={{ title: 'Buscar', tabBarIcon: icon('⌕') }} />
      <Tabs.Screen name="profile" options={{ title: 'Mi perfil', tabBarIcon: icon('●') }} />
    </Tabs>
  );
}
