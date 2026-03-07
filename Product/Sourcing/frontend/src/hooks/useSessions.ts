import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import type { Session } from '../types';

export function useSessions(userToken: string) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userToken) return;
    setIsLoading(true);
    try {
      const list = await api.listSessions(userToken);
      setSessions(list);
    } catch {
      // Silently fail — history unavailable
    } finally {
      setIsLoading(false);
    }
  }, [userToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await api.deleteSession(sessionId, userToken);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      } catch {
        // ignore
      }
    },
    [userToken]
  );

  const search = useCallback(
    async (query: string): Promise<Session[]> => {
      if (!query.trim()) return sessions;
      try {
        return await api.searchSessions(userToken, query);
      } catch {
        return [];
      }
    },
    [sessions, userToken]
  );

  return { sessions, isLoading, refresh, deleteSession, search };
}
