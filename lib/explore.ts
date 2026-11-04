import { Post } from './posts';
import { PROFILE_SUMMARY_COLUMNS, Profile, ProfileSummary } from './profile';
import { supabase } from './supabase';

// Las funciones SQL están en supabase/migrations/003_explorar.sql.
// Sin tipos generados del esquema, supabase-js no sabe qué devuelven, así
// que se lo indicamos con "as unknown as ...".

export type ExploreFilters = {
  city: string | null;
  discipline: string | null; // clave de DISCIPLINES
  style: string | null;
};

export const NO_FILTERS: ExploreFilters = { city: null, discipline: null, style: null };

// Lo que hace falta para pintar a alguien en los resultados
export type ExploreProfile = ProfileSummary & Pick<Profile, 'city' | 'disciplines' | 'availability'>;

export const PEOPLE_PAGE_SIZE = 20;
export const EXPLORE_POSTS_PAGE_SIZE = 30; // múltiplo de 3: filas completas en la cuadrícula

// Personas. Orden alfabético por username, que es único: así sirve de cursor
// (la página siguiente es "los que van después del último que tengo").
export async function searchPeople(
  text: string,
  filters: ExploreFilters,
  onlyAvailable: boolean,
  last: ExploreProfile | null
) {
  const q = text.trim();
  const { data, error } = await supabase
    .rpc('search_profiles', {
      search_text: q.length >= 2 ? q : null, // 1 letra encuentra a medio mundo
      filter_city: filters.city,
      filter_discipline: filters.discipline,
      filter_style: filters.style,
      only_available: onlyAvailable,
      after_username: last?.username ?? null,
      page_size: PEOPLE_PAGE_SIZE,
    })
    .select(`${PROFILE_SUMMARY_COLUMNS}, city, disciplines, availability`);
  if (error) throw error;
  return (data ?? []) as unknown as ExploreProfile[];
}

// Publicaciones recientes de todo el mundo, filtradas por el perfil del autor
export async function explorePosts(filters: ExploreFilters, last: Post | null) {
  const { data, error } = await supabase.rpc('explore_posts', {
    filter_city: filters.city,
    filter_discipline: filters.discipline,
    filter_style: filters.style,
    before_created_at: last?.created_at ?? null,
    before_id: last?.id ?? null,
    page_size: EXPLORE_POSTS_PAGE_SIZE,
  });
  if (error) throw error;
  return (data ?? []) as unknown as Post[];
}

// Ciudades y estilos más usados, para ofrecerlos como chips
export async function fetchPopularFilters() {
  const [cities, styles] = await Promise.all([
    supabase.rpc('popular_cities', { max_results: 30 }),
    supabase.rpc('popular_styles', { max_results: 30 }),
  ]);
  if (cities.error) throw cities.error;
  if (styles.error) throw styles.error;
  const values = (rows: unknown) => ((rows ?? []) as { value: string }[]).map((r) => r.value);
  return { cities: values(cities.data), styles: values(styles.data) };
}
