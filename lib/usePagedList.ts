import { useCallback, useRef, useState } from 'react';

type Options<T> = {
  // Pide una página. `last` es el último elemento que ya tenemos (null = la
  // primera página); de él se saca el cursor (fecha+id, username...).
  fetchPage: (last: T | null) => Promise<T[]>;
  pageSize: number;
  keyOf: (item: T) => string;
};

// Lista paginada con scroll infinito y "tirar para refrescar". La usan el
// feed y explorar, para no repetir esta lógica (que tiene sus trampas) en
// cada pantalla.
//
// Las trampas, y cómo se evitan:
//  · onEndReached se dispara varias veces seguidas -> `busy` es un ref (se
//    actualiza al instante; un estado no se actualiza hasta el repintado).
//  · Si cambian los filtros mientras llega una respuesta vieja, esa
//    respuesta no debe pisar la nueva -> cada recarga tiene un número de
//    "generación" y las respuestas de generaciones anteriores se ignoran.
//  · Las funciones devueltas son estables (no cambian entre renders), así
//    que se pueden usar en useEffect/useFocusEffect sin provocar bucles.
export function usePagedList<T>(options: Options<T>) {
  const [items, setItems] = useState<T[] | null>(null); // null = cargando la primera vez
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs: lo que las funciones estables necesitan leer "en su valor actual"
  const opts = useRef(options);
  opts.current = options;
  const itemsRef = useRef<T[] | null>(null);
  const hasMore = useRef(true);
  const busy = useRef(false);
  const generation = useRef(0);

  const setBoth = (next: T[] | null) => {
    itemsRef.current = next;
    setItems(next);
  };

  // Primera página. clear: true vacía la lista antes (al cambiar filtros,
  // para no enseñar resultados de la búsqueda anterior mientras carga).
  const reload = useCallback(async ({ clear = false } = {}) => {
    const mine = ++generation.current;
    busy.current = true;
    if (clear) setBoth(null);
    try {
      const page = await opts.current.fetchPage(null);
      if (mine !== generation.current) return; // llegó tarde: hay otra más nueva
      setBoth(page);
      hasMore.current = page.length === opts.current.pageSize;
      setError(null);
    } catch (e: any) {
      if (mine === generation.current) setError(e.message);
    } finally {
      if (mine === generation.current) busy.current = false;
    }
  }, []);

  const loadMore = useCallback(async () => {
    const current = itemsRef.current;
    if (busy.current || !hasMore.current || !current || current.length === 0) return;
    const mine = generation.current;
    busy.current = true;
    setLoadingMore(true);
    try {
      const page = await opts.current.fetchPage(current[current.length - 1]);
      if (mine !== generation.current) return;
      // Sin duplicados (la key de FlatList debe ser única)
      const seen = new Set(current.map(opts.current.keyOf));
      setBoth([...current, ...page.filter((item) => !seen.has(opts.current.keyOf(item)))]);
      hasMore.current = page.length === opts.current.pageSize;
    } catch (e: any) {
      if (mine === generation.current) setError(e.message);
    } finally {
      if (mine === generation.current) busy.current = false;
      setLoadingMore(false);
    }
  }, []);

  const pullToRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  // Lee el ref, no el estado: útil dentro de useFocusEffect sin meter
  // `items` en sus dependencias (eso era lo que causaba el bucle del feed)
  const isEmpty = useCallback(() => !itemsRef.current || itemsRef.current.length === 0, []);

  return { items, error, loadingMore, refreshing, reload, loadMore, pullToRefresh, isEmpty };
}
