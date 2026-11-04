import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

// Borra mi cuenta con la Edge Function delete-account (ver
// supabase/functions/delete-account: allí está el porqué de cada paso).
// supabase-js manda solo el token de la sesión; la función saca de él
// quién soy, así que no se puede borrar la cuenta de otro.
export async function deleteMyAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
  if (error) {
    // Si la función respondió con un error, el texto útil va en el cuerpo
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      throw new Error(body?.error ?? error.message);
    }
    throw error;
  }
  // scope 'local': el usuario ya no existe en el servidor, así que solo hay
  // que olvidar la sesión guardada en el móvil
  await supabase.auth.signOut({ scope: 'local' });
}
