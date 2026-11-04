import { useMemo, useSyncExternalStore } from 'react';

// Likes y comentarios de cada publicación, compartidos por TODA la app.
//
// El problema que resuelve: el feed y el detalle de una publicación tenían
// cada uno su copia del post. Si dabas like o comentabas en el detalle, al
// volver el feed seguía enseñando lo de antes hasta refrescarlo.
//
// La solución: un único sitio (este Map, fuera de React) con el último dato
// conocido de cada post, venga de donde venga:
//   · del servidor: cada vez que se descarga un post (feed, detalle) se
//     apunta aquí con primePostStats();
//   · de la propia app: el like optimista y los comentarios nuevos o
//     borrados lo cambian con patchPostStats().
// Las pantallas lo leen con usePostStats() y se repintan solas al cambiar.
//
// Por qué no un Context de React o una librería (Zustand, Redux): para
// tres números por post sobra; useSyncExternalStore es la forma oficial de
// React de leer un almacén externo como este.

export type PostStats = { liked: boolean; likeCount: number; commentCount: number };

type ServerStats = { id: string; liked_by_me: boolean; like_count: number; comment_count: number };

const store = new Map<string, PostStats>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const fromServer = (p: ServerStats): PostStats => ({
  liked: p.liked_by_me,
  likeCount: p.like_count,
  commentCount: p.comment_count,
});

// Lo que acaba de llegar del servidor es lo más nuevo: pisa lo que hubiera
export function primePostStats(posts: ServerStats[]) {
  if (posts.length === 0) return;
  posts.forEach((p) => store.set(p.id, fromServer(p)));
  emit();
}

// Cambio hecho en la app. Se crea un objeto nuevo (no se modifica el viejo)
// para que React note el cambio.
export function patchPostStats(id: string, fn: (s: PostStats) => PostStats) {
  const current = store.get(id);
  if (!current) return;
  store.set(id, fn(current));
  emit();
}

export function getPostStats(id: string) {
  return store.get(id);
}

// Al cerrar sesión: "le he dado like" depende de quién soy
export function clearPostStats() {
  store.clear();
  emit();
}

// Lee los datos de un post. Si aún no están en el almacén (no debería
// pasar, los fetch los apuntan), usa los que trae el propio post.
// `fallback` va en useMemo porque useSyncExternalStore exige que la misma
// situación devuelva el MISMO objeto; uno nuevo en cada llamada provocaría
// repintados sin fin.
export function usePostStats(post: ServerStats): PostStats {
  const fallback = useMemo(() => fromServer(post), [post.id, post.liked_by_me, post.like_count, post.comment_count]);
  const read = () => store.get(post.id) ?? fallback;
  return useSyncExternalStore(subscribe, read, read);
}
