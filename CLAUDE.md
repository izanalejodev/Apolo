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
- `supabase/schema.sql`: tablas profiles, posts, follows, likes, comments + políticas RLS
- `supabase/auth_trigger.sql`: trigger que crea el perfil al registrarse (el username va en `options.data.username`)

## Reglas importantes

- En la app solo va la clave pública (publishable/anon). **Nunca** la `service_role`/secret, ni en la app ni en GitHub.
- Variables en `.env.local` (excluido por `.gitignore`), con prefijo `EXPO_PUBLIC_`. Tras cambiarlas, `npx expo start -c`.
- Toda tabla con RLS activado. Las reglas de quién puede qué viven en la base de datos, no en el cliente. Validar también en el servidor, no solo en la app.
- No guardar contadores (likes, seguidores); se calculan con `count(*)`.
- Antes de publicar en tiendas: confirmación de email activada y tabla `reports` (denuncias), que Apple/Google exigen en apps con contenido de usuarios.
- El proyecto se desarrolla fuera del horario laboral, con equipos y cuentas personales y sin reutilizar código ni datos de ninguna empresa (importante para poder venderlo con la titularidad clara). Repositorio privado en cuenta personal de GitHub.

## Próximos pasos (por orden)

1. Pantalla de perfil: ver/editar (nombre, bio, ciudad, disciplinas, estilos, disponibilidad) y botón de cerrar sesión
2. Publicar foto/vídeo (Supabase Storage)
3. Seguir a otros y feed
4. Explorar y búsqueda con filtros
5. Likes y comentarios
6. Chat (tablas conversations, conversation_members, messages + Realtime)
7. Denuncias/moderación
8. Más adelante: servicios como tabla propia, reservas y pagos

## Cómo trabajar conmigo

- Explícame siempre el porqué de cada decisión, no solo el código: quiero entender lo que hago.
- Tono informal pero serio. Responde en español.
- Dime si algo que propongo es mala idea o demasiado para el alcance de una persona a tiempo parcial.
