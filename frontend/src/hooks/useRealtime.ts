import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { RealtimeEvent, subscribeRealtime } from '../services/realtime';

export function useRealtime(listener: (event: RealtimeEvent) => void) {
  const { token, user } = useAuth();
  const current = useRef(listener);
  current.current = listener;
  useEffect(() => token ? subscribeRealtime(token, event => current.current(event), user?.id) : undefined, [token, user?.id]);
}
