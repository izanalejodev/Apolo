import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { onReadChange, subscribeToMessages } from './chat';
import { supabase } from './supabase';

// Número de conversaciones con algo sin leer, para el globo de la pestaña
// Mensajes. Lo calcula la BD (unread_conversations_count, migración 008):
// es un count, no un contador guardado.
//
// Se vuelve a preguntar cuando puede haber cambiado:
//   · llega un mensaje (Realtime; también al reconectar);
//   · marco una conversación como leída (al abrir el chat);
//   · la app vuelve de segundo plano (pudo llegar algo mientras tanto).
// Es una consulta pequeña; más sencillo que llevar la cuenta a mano.
export function useUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('unread_conversations_count');
    if (!error) setCount((data as number) ?? 0);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    refresh();
    const stopMessages = subscribeToMessages(null, () => refresh(), () => refresh());
    const stopRead = onReadChange(refresh);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => {
      stopMessages();
      stopRead();
      appState.remove();
    };
  }, [enabled, refresh]);

  return count;
}
