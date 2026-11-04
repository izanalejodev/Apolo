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
- `app/(auth)/login.tsx`: registro e inicio de sesión; `app/(auth)/reset-password.tsx`: recuperar contraseña con un **código** por email (`resetPasswordForEmail` → `verifyOtp` tipo `recovery` → `updateUser`), no con enlace, para no depender de deep links. AuthGate no saca de esa pantalla aunque haya sesión. La plantilla del email está en `supabase/email_templates/reset_password.html` (hay que pegarla en el panel). Errores de Auth traducidos en `lib/authErrors.ts`
- `app/(tabs)/`: pestañas inferiores: `index.tsx` (feed), `explore.tsx` (personas y publicaciones con filtros de ciudad, disciplina, estilo y disponibilidad) y `profile.tsx` (mi perfil); `app/edit-profile.tsx`: editarlo
- `app/user/[id].tsx`: perfil de otro con botón Seguir (optimista); `app/follow-list.tsx?userId&kind`: seguidores/seguidos
- `lib/follows.ts`: seguir, dejar de seguir y listas; `components/ProfileHeader.tsx` se comparte entre mi perfil y el de otros
- Feed: función SQL `public.feed()` (migración 002), paginación por cursor `(created_at, id)`; se llama con `rpc('feed').select(...)` para traer el autor en la misma petición
- Explorar: funciones SQL `search_profiles`, `explore_posts`, `popular_cities`, `popular_styles` (migración 003) en `lib/explore.ts`. Comparaciones sin tildes con `public.f_unaccent()` (unaccent/pg_trgm en el esquema `extensions`). Parámetros de funciones SQL con prefijo (`filter_city`): si se llaman como una columna, gana la columna
- `lib/usePagedList.ts`: hook de lista paginada (scroll infinito, refresco, ignora respuestas viejas). Usarlo para cualquier lista nueva en vez de repetir la lógica
- `lib/profile.ts`: tipo `Profile`, lista cerrada de disciplinas, límites y consultas del perfil
- `lib/alert.ts`: `showAlert`/`confirmAction`; usar siempre estos en vez de `Alert.alert` (que no hace nada en web)
- `supabase/schema.sql`: foto del esquema actual (tablas, enums, RLS, grants por columna). Solo para montar un proyecto nuevo desde cero
- `supabase/migrations/NNN_*.sql`: cambios sobre la base de datos existente, se ejecutan una vez y en orden
- `supabase/storage.sql`: buckets `avatars` y `posts` y sus políticas (archivos en `<bucket>/<user_id>/...`)
- `lib/media.ts`: elegir, reducir y subir imágenes; en la BD se guarda la ruta (`*_path`), la URL se construye con `publicUrl`
- `lib/posts.ts`: crear, listar y borrar publicaciones; `app/new-post.tsx`: pantalla de publicar. Al publicar se guarda `posts.width`/`height` (migración 008) y el feed pinta la foto con `feedAspectRatio()` (entre 4:5 y 1,91:1; sin tamaño, cuadrada)
- `components/PostGrid.tsx`: `PostGrid` es una FlatList de 3 columnas con scroll infinito (`fetchUserPosts(userId, last)`, 30 por página) donde la cabecera del perfil y el pie van como header/footer; `PostTile` es la casilla, también la usa explorar
- `app/post/[id].tsx`: detalle de publicación (comentarios, comentar, borrar si es mía). La abren el feed (icono 💬) y las cuadrículas de perfil y explorar
- Likes y comentarios: `lib/likes.ts` (`useLike`, optimista) y `lib/comments.ts`. Los posts traen `like_count`, `comment_count` y `liked_by_me`, que son campos calculados de PostgREST (funciones SQL que reciben `public.posts`, migración 004) y se piden en el `select` como columnas
- `lib/postStats.ts`: almacén compartido (fuera de React, con `useSyncExternalStore`) de likes y comentarios por post. Los fetch lo rellenan con `primePostStats`, los cambios locales con `patchPostStats` y se lee con `usePostStats`; así el feed y el detalle ven lo mismo. Cualquier pantalla nueva que muestre contadores de un post debe leerlos de aquí
- `app/likes.tsx?postId`: quién dio like (función `post_likers`, sin cuentas bloqueadas); se abre tocando el número de likes
- Chat (migración 005): `lib/chat.ts`, `app/(tabs)/messages.tsx` (bandeja) y `app/chat/[id].tsx` (conversación). Solo 1 a 1 por ahora, pero con tabla `conversation_members` para poder hacer grupos. Las conversaciones se crean solo con la función `get_or_create_dm` (la app no puede insertar en `conversations` ni en `conversation_members`); bandeja con `my_conversations()`, leído con `mark_conversation_read()` (`last_read_at`). Las políticas usan `is_conversation_member()` (security definer, para evitar la recursión infinita de RLS). Tiempo real con Realtime `postgres_changes` sobre `messages` (aplica RLS); al suscribirse o reconectar se recarga para no perder lo que llegó sin conexión. Globo de no leídos en la pestaña con `lib/unread.ts` (`unread_conversations_count()`, migración 008)
- Notificaciones push (migración 008): `lib/push.ts` registra el token de Expo en `push_tokens` con `register_push_token()` (security definer: un móvil es de una sola cuenta) y lo borra al cerrar sesión; lo llama `app/(tabs)/_layout.tsx`, que también abre el chat al tocar la notificación. Las manda `supabase/functions/notify-message` (trigger `messages_notify`, `WEBHOOK_SECRET`, Verify JWT desactivado). No funcionan en web, simulador ni Expo Go Android: hace falta development build. Android necesita Firebase (`google-services.json` + clave FCM V1 en EAS); iOS, cuenta de Apple Developer
- Llamadas a Edge Functions (migración 009): no se usan los Database Webhooks del panel sino triggers con pg_net (`call_edge_function('<nombre>')`), que leen `project_url` y `webhook_secret` de Vault. Esos dos secretos se crean a mano con `vault.create_secret` y nunca van en el repo. `webhook_secret` debe valer lo mismo que el secreto `WEBHOOK_SECRET` de las funciones. Respuestas de las llamadas en `net._http_response`
- Limpieza: pg_cron borra cada noche las denuncias de más de 12 meses (tarea `borrar-denuncias-viejas`, migración 008)
- Moderación (migración 006): `lib/moderation.ts`, `app/report.tsx?kind&id` (modal de denuncia) y `app/blocked.tsx` (cuentas bloqueadas). Un bloqueo vale en los dos sentidos y lo aplica RLS con `is_blocked_with()` (posts y comentarios ocultos, sin follows, likes, comentarios ni mensajes, fuera de la búsqueda); se bloquea con `block_user()` (borra los follows en los dos sentidos) y se desbloquea borrando la fila de `blocks`. Las denuncias se crean solo con `report_content()`, que saca el autor de la BD y guarda una copia (`snapshot`); `reports` no tiene políticas: se revisa en el panel de Supabase
- Tiendas: `app/settings.tsx` (ajustes: bloqueados, legal, contacto, cerrar sesión, eliminar cuenta), `app/delete-account.tsx` + `lib/account.ts` → Edge Function `supabase/functions/delete-account` (borra Storage y luego el usuario; el resto cae en cascada). `supabase/functions/notify-report`: aviso por Telegram de denuncias nuevas (trigger `reports_notify`, sin contenido personal). Las dos con "Verify JWT" desactivado (la primera comprueba la sesión con `auth.getUser`, la segunda con `WEBHOOK_SECRET`). `supabase/functions` está excluido del `tsconfig` (es Deno)
- Legal: textos en `lib/legal.ts` (borrador, con datos del titular entre corchetes), se ven en `app/legal/[doc].tsx` (`terms`/`privacy`), ruta pública sin sesión. Al registrarse se manda `terms_version` y el trigger lo guarda en `terms_acceptances` (migración 007); sin él, el registro falla. Por eso "Add user" en el panel ya no funciona: cuentas de prueba, desde la app. Si cambian los términos de forma importante, subir `TERMS_VERSION`
- CLI de Supabase: dependencia de desarrollo (`npx supabase ...`), configuración en `supabase/config.toml` (ahí van las funciones con `verify_jwt = false`). Desplegar funciones: `npm run deploy:functions` (todas) o `npx supabase functions deploy <nombre>`. Las migraciones se siguen ejecutando a mano en el SQL Editor: NO usar `supabase db push` (la CLI no sabe que ya están aplicadas; antes habría que marcarlas con `supabase migration repair`)
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
- Antes de publicar en tiendas (el código ya está: denunciar, bloquear, términos, borrar cuenta, aviso de denuncias): rellenar los corchetes de `lib/legal.ts`, activar la confirmación de email con SMTP propio, publicar la web para tener URL de privacidad, y lo que falta de la lista del paso 8.
- El proyecto se desarrolla fuera del horario laboral, con equipos y cuentas personales y sin reutilizar código ni datos de ninguna empresa (importante para poder venderlo con la titularidad clara). Repositorio privado en cuenta personal de GitHub.

## Próximos pasos (por orden)

1. ~~Pantalla de perfil: ver/editar y botón de cerrar sesión~~ (hecho)
2. Publicar foto/vídeo: ~~fotos y avatar (Supabase Storage)~~, ~~cuadrícula del perfil paginada~~ hecho; falta vídeo (paso 9)
3. ~~Seguir a otros y feed~~, ~~foto con su proporción (width/height)~~ (hecho). Pendiente menor: las listas de seguidores/seguidos tienen límite de 100 sin paginar
4. ~~Explorar y búsqueda con filtros~~ (hecho). Pendiente menor: los chips de ciudad/estilo muestran solo los 30 más usados; las publicaciones se filtran por el perfil del autor, no por `posts.tags` (la app aún no pone tags)
5. ~~Likes y comentarios~~, ~~sincronizados entre pantallas~~, ~~lista de quién dio like~~ (hecho). Pendiente menor: un post borrado sigue en el feed hasta refrescar
6. ~~Chat 1 a 1 con tiempo real~~, ~~no leídos en la pestaña~~, ~~push de mensajes~~ (código hecho). Pendiente: probar push en una development build (Firebase para Android, Apple Developer para iOS); si Realtime se queda corto con muchos usuarios, pasar a Broadcast
7. ~~Denuncias y bloqueos~~ (hecho)
8. Requisitos de tiendas: ~~términos, eliminar cuenta, aviso de denuncias, ajustes con contacto, borrar denuncias de más de 12 meses~~ (código hecho). Pendiente (no es código, depende de ti): decidir el nombre y con él bundle id / package (no se pueden cambiar tras publicar), iconos y capturas; rellenar corchetes de `lib/legal.ts`; SMTP propio; cuenta de prueba para la revisión de Apple; formularios de privacidad de las tiendas
9. Vídeo (decidir Mux vs Cloudflare Stream)
10. Más adelante: servicios como tabla propia, reservas y pagos

## Cómo trabajar conmigo

- Explícame siempre el porqué de cada decisión, no solo el código: quiero entender lo que hago.
- Tono informal pero serio. Responde en español.
- Dime si algo que propongo es mala idea o demasiado para el alcance de una persona a tiempo parcial.
