# Red social para artistas (nombre por decidir)

App móvil tipo Instagram/TikTok/X pensada para artistas (bailarines, cantantes, fotógrafos...) y para usuarios que solo ven contenido. Combina lo social (perfil, publicaciones, seguidores) con un gancho profesional: el perfil funciona como currículum y permite que se cierren acuerdos (contrataciones, clases, alquiler de salas, sesiones de fotos).

Origen: el desarrollador es bailarín de baile urbano y parte de la idea de que el currículum de un artista son sus redes sociales.

## Stack

- App: React Native con Expo (expo-router), TypeScript
- Backend: Supabase (Postgres, Auth, Storage). No hay backend propio: la app habla directo con Supabase
- Vídeo (más adelante): Mux o Cloudflare Stream, no servir MP4 propios
- Búsqueda: filtros y búsqueda de texto de Postgres; nada de Algolia/Elasticsearch por ahora

## Decisiones tomadas

- **V1 = red social**: login, perfil, publicaciones, seguidores, feed, comentarios/likes y chat (el chat al final de la V1).
- **Venta de servicios = después**, cuando la red social funcione. En V1 solo hay un campo de texto libre `services_text` en el perfil y el contacto se hace fuera de la app. Los pagos dentro de la app (Stripe Connect, reservas, comisiones) vienen más tarde.
- **Capa profesional mínima ya en V1**: en el perfil `city`, `disciplines`, `styles`, `availability`, `services_text`, `contact_link`, y búsqueda con filtros por esos campos.
- **Seguidores unidireccionales** (como Instagram/TikTok/X), no solicitudes de amistad. Posible cuenta privada con aprobación más adelante.
- **Feed cronológico** de a quién sigo + pestaña explorar por estilo y ciudad. Sin algoritmo al principio.
- **Vídeo corto** con límite de 60 s.
- Nombres candidatos (sin decidir): Apolo (y variantes), Foco, Duende, Musa, Lira. Falta comprobar dominio, @ en redes y marca registrada.

## Estructura del proyecto

- `lib/supabase.ts`: único sitio donde se crea el cliente de Supabase
- `providers/AuthProvider.tsx`: sesión (`useAuth()` devuelve `session` y `loading`)
- `app/_layout.tsx`: AuthGate, redirige a login si no hay sesión
- `app/(auth)/login.tsx`: registro e inicio de sesión
- `app/(tabs)/`: pestañas inferiores: `index.tsx` (feed), `search.tsx` (buscar por @usuario/nombre, provisional hasta el paso 4) y `profile.tsx` (mi perfil); `app/edit-profile.tsx`: editarlo
- `app/user/[id].tsx`: perfil de otro con botón Seguir (optimista); `app/follow-list.tsx?userId&kind`: seguidores/seguidos
- `lib/follows.ts`: seguir, dejar de seguir y listas; `components/ProfileHeader.tsx` se comparte entre mi perfil y el de otros
- Feed: función SQL `public.feed()` (migración 002), paginación por cursor `(created_at, id)`; se llama con `rpc('feed').select(...)` para traer el autor en la misma petición
- `lib/profile.ts`: tipo `Profile`, lista cerrada de disciplinas, límites y consultas del perfil
- `lib/alert.ts`: `showAlert`/`confirmAction`; usar siempre estos en vez de `Alert.alert` (que no hace nada en web)
- `supabase/schema.sql`: foto del esquema actual (tablas, enums, RLS, grants por columna). Solo para montar un proyecto nuevo desde cero
- `supabase/migrations/NNN_*.sql`: cambios sobre la base de datos existente, se ejecutan una vez y en orden
- `supabase/storage.sql`: buckets `avatars` y `posts` y sus políticas (archivos en `<bucket>/<user_id>/...`)
- `lib/media.ts`: elegir, reducir y subir imágenes; en la BD se guarda la ruta (`*_path`), la URL se construye con `publicUrl`
- `lib/posts.ts`: crear, listar y borrar publicaciones; `app/new-post.tsx`: pantalla de publicar
- `components/`: componentes reutilizables (nunca dentro de `app/`, que son rutas)
- `supabase/auth_trigger.sql`: trigger que crea el perfil al registrarse (el username va en `options.data.username`)

## Reglas importantes

- En la app solo va la clave pública (publishable/anon). **Nunca** la `service_role`/secret, ni en la app ni en GitHub.
- Variables en `.env.local` (excluido por `.gitignore`), con prefijo `EXPO_PUBLIC_`. Tras cambiarlas, `npx expo start -c`.
- Toda tabla con RLS activado. Las reglas de quién puede qué viven en la base de datos, no en el cliente. Validar también en el servidor, no solo en la app.
- Cambios en la base de datos: nuevo fichero en `supabase/migrations/` y, tras ejecutarlo, actualizar `schema.sql`. Nunca suponer el esquema: si hay duda, consultar `information_schema` en el SQL Editor.
- Nombres reales a recordar: `follows.followed_id` (no following_id), `posts.duration_seconds`, enums `availability_status` y `media_kind`.
- No guardar contadores (likes, seguidores); se calculan con `count(*)`.
- Las disciplinas son una lista cerrada que vive en dos sitios: `DISCIPLINES` en `lib/profile.ts` y el CHECK `profiles_disciplines_validas` de `schema.sql`. Cambiar ambos a la vez. Igual con las columnas editables (`ProfileUpdate` ↔ `grant update`).
- Antes de publicar en tiendas: confirmación de email activada (ahora desactivada para desarrollar) y tabla `reports` (denuncias), que Apple/Google exigen en apps con contenido de usuarios.
- El proyecto se desarrolla fuera del horario laboral, con equipos y cuentas personales y sin reutilizar código ni datos de ninguna empresa (importante para poder venderlo con la titularidad clara). Repositorio privado en cuenta personal de GitHub.

## Próximos pasos (por orden)

1. ~~Pantalla de perfil: ver/editar y botón de cerrar sesión~~ (hecho)
2. Publicar foto/vídeo: ~~fotos y avatar (Supabase Storage)~~ hecho; falta vídeo (decidir Mux vs Cloudflare Stream). Pendiente: pantalla de detalle de publicación (ahora se borra con pulsación larga en la cuadrícula) y paginación (ahora límite de 60)
3. ~~Seguir a otros y feed~~ (hecho). Pendiente: guardar ancho/alto de la foto en `posts` para no recortarla en el feed
4. Explorar y búsqueda con filtros
5. Likes y comentarios
6. Chat (tablas conversations, conversation_members, messages + Realtime)
7. Denuncias/moderación
8. Más adelante: servicios como tabla propia, reservas y pagos

## Cómo trabajar conmigo

- Explícame siempre el porqué de cada decisión, no solo el código: quiero entender lo que hago.
- Tono informal pero serio. Responde en español.
- Dime si algo que propongo es mala idea o demasiado para el alcance de una persona a tiempo parcial.
