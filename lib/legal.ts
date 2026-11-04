// Términos de uso y política de privacidad.
//
// ⚠️ BORRADOR. Están pensados para un particular en España que ofrece una
// red social gratuita, pero NO los ha revisado un abogado. Antes de
// publicar: rellenar lo que va entre [corchetes] y, si se puede, que lo
// revise un profesional (sobre todo cuando haya pagos dentro de la app).
//
// Viven en el código (y no solo en una web) para que se puedan leer antes
// de registrarse y sin conexión. La ruta /legal/[doc] es pública (AuthGate
// la deja pasar), así que la versión web de la app sirve también como la
// URL que piden App Store y Google Play.
//
// Si cambias los TÉRMINOS de forma importante, sube TERMS_VERSION: queda
// registrado qué versión aceptó cada uno (tabla terms_acceptances).

export const APP_NAME = 'Apolo'; // nombre provisional
export const TERMS_VERSION = '2026-11-04';
export const MIN_AGE = 14; // edad mínima de consentimiento en España (LOPDGDD art. 7)

export const OWNER = {
  name: '[NOMBRE Y APELLIDOS]',
  nif: '[NIF]',
  city: '[CIUDAD], España',
  email: '[EMAIL DE CONTACTO]',
};

export type LegalDoc = {
  title: string;
  updated: string;
  sections: { heading: string; body: string }[];
};

export const TERMS: LegalDoc = {
  title: 'Términos de uso',
  updated: TERMS_VERSION,
  sections: [
    {
      heading: '1. Quién ofrece el servicio',
      body: `${APP_NAME} es una red social para artistas ofrecida por ${OWNER.name} (NIF ${OWNER.nif}), con domicilio en ${OWNER.city}. Contacto: ${OWNER.email}.`,
    },
    {
      heading: '2. Aceptación',
      body: `Al crear una cuenta aceptas estos términos y la política de privacidad. Si no estás de acuerdo, no uses ${APP_NAME}.`,
    },
    {
      heading: '3. Edad mínima',
      body: `Tienes que tener al menos ${MIN_AGE} años para registrarte. Si tenemos indicios de que no es así, podemos cerrar la cuenta.`,
    },
    {
      heading: '4. Tu cuenta',
      body: 'Eres responsable de lo que se haga con tu cuenta y de mantener tu contraseña en secreto. Los datos de tu perfil tienen que ser veraces: no puedes hacerte pasar por otra persona, artista o empresa.',
    },
    {
      heading: '5. Tolerancia cero con el contenido ofensivo y los usuarios abusivos',
      body: `No se permite publicar, enviar ni enlazar contenido que:
• acose, intimide o amenace a otras personas;
• promueva el odio o la discriminación por origen, religión, sexo, orientación sexual, discapacidad u otra condición;
• contenga desnudos o contenido sexual, y nunca contenido sexual que implique a menores;
• muestre o incite a la violencia, autolesiones o actividades ilegales;
• sea spam, estafa o publicidad engañosa;
• infrinja derechos de autor, de imagen o de otro tipo de terceros.

Podemos retirar cualquier contenido que incumpla estas normas y suspender o cerrar, sin previo aviso, la cuenta de quien las incumpla. Revisamos las denuncias en un plazo máximo de 24 horas.`,
    },
    {
      heading: '6. Denunciar y bloquear',
      body: 'Puedes denunciar publicaciones, comentarios, mensajes y perfiles desde la app, y bloquear a cualquier usuario: dejaréis de ver vuestro contenido y no podrá escribirte. Quien recibe la denuncia no sabe quién la ha hecho.',
    },
    {
      heading: '7. Tu contenido',
      body: `Lo que publicas sigue siendo tuyo. Al publicarlo nos das permiso, gratuito y mientras esté publicado, para alojarlo, mostrarlo a otros usuarios y adaptarlo técnicamente (por ejemplo, reducir el tamaño de las fotos). Este permiso termina cuando lo borras o borras tu cuenta. Solo publica contenido sobre el que tengas derechos, y cuenta con el permiso de las personas que aparecen en él.`,
    },
    {
      heading: '8. Acuerdos entre usuarios',
      body: `${APP_NAME} sirve para que los artistas muestren su trabajo y se pongan en contacto. Los acuerdos que cerréis (contrataciones, clases, alquileres, sesiones) son entre vosotros: ${APP_NAME} no es parte de ellos ni responde de su cumplimiento.`,
    },
    {
      heading: '9. El servicio',
      body: `${APP_NAME} es gratuito y se ofrece tal cual. Intentamos que funcione bien, pero no podemos garantizar que no haya fallos o interrupciones. Podemos cambiar o dejar de ofrecer funciones; si los cambios en estos términos son importantes, te los mostraremos para que los aceptes de nuevo.`,
    },
    {
      heading: '10. Borrar tu cuenta',
      body: 'Puedes borrar tu cuenta cuando quieras desde Mi perfil → Ajustes → Eliminar cuenta. Se borran tu perfil, tus publicaciones, comentarios, likes, mensajes y fotos.',
    },
    {
      heading: '11. Ley aplicable',
      body: 'Estos términos se rigen por la ley española. Si eres consumidor, puedes acudir a los tribunales de tu domicilio.',
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Política de privacidad',
  updated: TERMS_VERSION,
  sections: [
    {
      heading: '1. Responsable',
      body: `${OWNER.name} (NIF ${OWNER.nif}), ${OWNER.city}. Para cualquier cuestión de privacidad: ${OWNER.email}.`,
    },
    {
      heading: '2. Qué datos tratamos',
      body: `• Cuenta: email y contraseña (guardada cifrada, nadie puede leerla).
• Perfil: nombre de usuario, nombre, foto, biografía, ciudad, disciplinas, estilos, disponibilidad, servicios y enlace de contacto. Son públicos para los demás usuarios.
• Contenido: publicaciones, comentarios, likes y a quién sigues. Son visibles para los demás usuarios.
• Mensajes privados: solo los ven los participantes de la conversación. No están cifrados de extremo a extremo; no los leemos salvo que alguien los denuncie.
• Bloqueos y denuncias que hagas o recibas.
• Si activas las notificaciones: un identificador del móvil para poder enviártelas. Se borra al cerrar sesión o eliminar la cuenta.
• Datos técnicos necesarios para que funcione el servicio (registros de acceso y errores).

No usamos tus datos para publicidad, no los vendemos y no hay rastreo entre apps.`,
    },
    {
      heading: '3. Para qué y con qué base legal',
      body: `• Prestarte el servicio (cuenta, perfil, publicaciones, mensajes): porque es necesario para el contrato que aceptas al registrarte (art. 6.1.b RGPD).
• Seguridad y moderación (revisar denuncias, evitar abusos): interés legítimo en mantener la plataforma segura (art. 6.1.f RGPD).
• Cumplir obligaciones legales, si una autoridad lo requiere (art. 6.1.c RGPD).`,
    },
    {
      heading: '4. Quién más trata tus datos',
      body: `Proveedores que nos dan la infraestructura, con contrato de encargado del tratamiento:
• Supabase (base de datos, autenticación y almacenamiento de archivos). Servidores en [REGIÓN DEL PROYECTO, p. ej. Unión Europea (Fráncfort)].
• Expo (servicio de notificaciones push), y Apple y Google, que las entregan en tu móvil. La notificación de un mensaje nuevo incluye el nombre de quien escribe y el principio del mensaje. Puedes desactivarlas en los ajustes del móvil.
• Apple y Google, si usas sus tiendas para instalar la app.
No cedemos tus datos a nadie más salvo obligación legal.`,
    },
    {
      heading: '5. Cuánto tiempo',
      body: 'Mientras tengas la cuenta. Al borrarla se eliminan tu perfil, tu contenido, tus mensajes y tus fotos. Las denuncias se conservan, con una copia del contenido denunciado, el tiempo necesario para resolverlas y como máximo 12 meses, para poder actuar ante abusos repetidos.',
    },
    {
      heading: '6. Tus derechos',
      body: `Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad de tus datos escribiendo a ${OWNER.email}. Muchos los puedes ejercer tú mismo desde la app (editar el perfil, borrar contenido, eliminar la cuenta). Si crees que no los hemos atendido bien, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).`,
    },
    {
      heading: '7. Menores',
      body: `${APP_NAME} no está dirigida a menores de ${MIN_AGE} años. Si sabemos que se ha registrado alguien menor de esa edad, borraremos su cuenta.`,
    },
    {
      heading: '8. Cambios',
      body: 'Si cambiamos esta política de forma importante, te avisaremos en la app.',
    },
  ],
};

export const LEGAL_DOCS = { terms: TERMS, privacy: PRIVACY } as const;
export type LegalDocKey = keyof typeof LEGAL_DOCS;
