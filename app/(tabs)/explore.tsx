import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Chip, ChipRow } from '../../components/Chip';
import { ProfileRow } from '../../components/ProfileRow';
import {
  EXPLORE_POSTS_PAGE_SIZE,
  ExploreFilters,
  ExploreProfile,
  NO_FILTERS,
  PEOPLE_PAGE_SIZE,
  explorePosts,
  fetchPopularFilters,
  searchPeople,
} from '../../lib/explore';
import { publicUrl } from '../../lib/media';
import { Post } from '../../lib/posts';
import { DISCIPLINES, disciplineLabel } from '../../lib/profile';
import { usePagedList } from '../../lib/usePagedList';

type Mode = 'people' | 'posts';

const DISCIPLINE_OPTIONS = DISCIPLINES.map((d) => ({ value: d.key, label: d.label }));
const asOptions = (values: string[]) => values.map((v) => ({ value: v, label: v }));

// Pestaña "Explorar": personas (el "currículum": busco bailarina de popping
// en Cádiz disponible) y publicaciones recientes de todo el mundo, con los
// mismos filtros de ciudad, disciplina y estilo.
export default function ExploreScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('people');
  const [text, setText] = useState(''); // lo que se escribe
  const [query, setQuery] = useState(''); // lo que se busca (300 ms después)
  const [filters, setFilters] = useState<ExploreFilters>(NO_FILTERS);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [popular, setPopular] = useState<{ cities: string[]; styles: string[] }>({ cities: [], styles: [] });

  // Debounce: buscar al dejar de escribir y no en cada tecla. Si no,
  // "popping" serían 7 consultas.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  // Si falla no pasa nada grave: simplemente no salen esas filas de chips
  useEffect(() => {
    fetchPopularFilters().then(setPopular).catch(() => {});
  }, []);

  const people = usePagedList<ExploreProfile>({
    fetchPage: (last) => searchPeople(query, filters, onlyAvailable, last),
    pageSize: PEOPLE_PAGE_SIZE,
    keyOf: (p) => p.id,
  });
  const posts = usePagedList<Post>({
    fetchPage: (last) => explorePosts(filters, last),
    pageSize: EXPLORE_POSTS_PAGE_SIZE,
    keyOf: (p) => p.id,
  });

  // Al cambiar de pestaña o de filtros, primera página desde cero.
  // reload es estable (ver usePagedList), así que no provoca bucles.
  const reloadPeople = people.reload;
  const reloadPosts = posts.reload;
  useEffect(() => {
    if (mode === 'people') reloadPeople({ clear: true });
  }, [mode, query, filters, onlyAvailable, reloadPeople]);
  useEffect(() => {
    if (mode === 'posts') reloadPosts({ clear: true });
  }, [mode, filters, reloadPosts]);

  function toggle(key: keyof ExploreFilters, value: string) {
    setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }));
  }

  const hasFilters = !!(filters.city || filters.discipline || filters.style || onlyAvailable);

  // Cabecera como elemento (no como componente definido aquí dentro): si
  // fuera un componente nuevo en cada render, React desmontaría el
  // TextInput a cada tecla y se cerraría el teclado.
  const header = (
    <View style={styles.header}>
      <View style={styles.segment}>
        <SegmentButton label="Personas" active={mode === 'people'} onPress={() => setMode('people')} />
        <SegmentButton label="Publicaciones" active={mode === 'posts'} onPress={() => setMode('posts')} />
      </View>

      {mode === 'people' && (
        <TextInput
          style={styles.input}
          placeholder="Buscar por @usuario o nombre"
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      )}

      <ChipRow
        label="Disciplina"
        options={DISCIPLINE_OPTIONS}
        selected={filters.discipline}
        onToggle={(v) => toggle('discipline', v)}
      />
      {popular.cities.length > 0 && (
        <ChipRow
          label="Ciudad"
          options={asOptions(popular.cities)}
          selected={filters.city}
          onToggle={(v) => toggle('city', v)}
        />
      )}
      {popular.styles.length > 0 && (
        <ChipRow
          label="Estilo"
          options={asOptions(popular.styles)}
          selected={filters.style}
          onToggle={(v) => toggle('style', v)}
        />
      )}

      <View style={styles.footerRow}>
        {mode === 'people' && (
          <Chip label="Solo disponibles" selected={onlyAvailable} onPress={() => setOnlyAvailable((v) => !v)} />
        )}
        {hasFilters && (
          <Pressable
            onPress={() => {
              setFilters(NO_FILTERS);
              setOnlyAvailable(false);
            }}
          >
            <Text style={styles.clear}>Quitar filtros</Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  const list = mode === 'people' ? people : posts;
  const empty = list.error ? (
    <Text style={styles.empty}>Error: {list.error}</Text>
  ) : !list.items ? (
    <ActivityIndicator style={{ marginTop: 24 }} />
  ) : (
    <Text style={styles.empty}>
      {mode === 'people' ? 'Nadie con esos filtros.' : 'No hay publicaciones con esos filtros.'}
    </Text>
  );
  const footer = list.loadingMore ? <ActivityIndicator style={{ margin: 16 }} /> : undefined;
  const refresh = <RefreshControl refreshing={list.refreshing} onRefresh={list.pullToRefresh} />;

  // Dos FlatList y no una: la de publicaciones tiene 3 columnas, y FlatList
  // no permite cambiar numColumns sobre la marcha.
  return mode === 'people' ? (
    <FlatList
      key="people"
      data={people.items ?? []}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProfileRow profile={item} detail={personDetail(item)} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={people.loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={refresh}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    />
  ) : (
    <FlatList
      key="posts"
      data={posts.items ?? []}
      keyExtractor={(p) => p.id}
      numColumns={3}
      renderItem={({ item }) => (
        // Sin pantalla de detalle todavía: al tocar, el perfil del autor
        <Pressable
          style={styles.tile}
          onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.author_id } })}
        >
          <Image source={{ uri: publicUrl('posts', item.media_path) }} style={styles.tileImage} />
        </Pressable>
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      onEndReached={posts.loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={refresh}
    />
  );
}

// "Cádiz · Baile, Canto · Disponible"
function personDetail(p: ExploreProfile) {
  return [
    p.city,
    p.disciplines.map(disciplineLabel).join(', '),
    p.availability === 'available' ? 'Disponible' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentActive]} onPress={onPress}>
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingVertical: 12 },
  segment: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#111',
    borderRadius: 10,
    overflow: 'hidden',
  },
  segmentButton: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: '#111' },
  segmentText: { fontSize: 15, fontWeight: '600', color: '#111' },
  segmentTextActive: { color: '#fff' },
  input: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  clear: { color: '#0a66c2', fontSize: 14 },
  empty: { textAlign: 'center', color: '#666', padding: 24 },
  tile: { width: '33.333%', aspectRatio: 1, padding: 1 },
  tileImage: { flex: 1, backgroundColor: '#eee' },
});
