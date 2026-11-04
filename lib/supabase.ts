import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: {
      storage: AsyncStorage,      // guarda la sesión en el móvil
      autoRefreshToken: true,     // renueva el token solo
      persistSession: true,       // no hay que iniciar sesión cada vez
      detectSessionInUrl: false,  // en móvil no hay URL de redirección
    },
  }
);
