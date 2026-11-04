// Los errores de Supabase Auth llegan en inglés y con texto técnico. Aquí
// se traducen los habituales (registro, login y recuperar contraseña).
// Se compara por trozos del texto porque Auth no siempre manda un código.
export function friendlyAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (m.includes('already registered')) return 'Ya existe una cuenta con ese email.';
  if (m.includes('email not confirmed')) {
    return 'Todavía no has confirmado tu email. Busca el enlace que te enviamos (mira también en spam).';
  }
  if (m.includes('database error saving new user')) {
    return 'Ese nombre de usuario ya está cogido o no es válido.';
  }
  // Recuperar contraseña
  if (m.includes('expired') || (m.includes('invalid') && m.includes('token'))) {
    return 'El código no es correcto o ha caducado. Pide uno nuevo.';
  }
  if (m.includes('should be different')) return 'La contraseña nueva tiene que ser distinta de la anterior.';
  if (m.includes('password should be')) return 'La contraseña es demasiado débil. Usa al menos 6 caracteres.';
  // "For security purposes, you can only request this after 42 seconds."
  const wait = m.match(/after (\d+) seconds?/);
  if (wait) return `Espera ${wait[1]} segundos antes de pedir otro código.`;
  if (m.includes('rate limit')) return 'Se han pedido demasiados emails. Inténtalo dentro de un rato.';
  return message;
}
