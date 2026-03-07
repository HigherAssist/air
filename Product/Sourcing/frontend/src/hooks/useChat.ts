import { useState, useCallback, useRef } from 'react';
import { api } from '../services/api';
import type { Message, Session } from '../types';

export function useChat(userToken: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;
      setError(null);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      try {
        const response = await api.sendMessage({
          message: content,
          session_id: currentSession?.id,
          user_token: userToken,
        });

        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: response.reply,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);

        // Update or set current session
        if (!currentSession || currentSession.id !== response.session_id) {
          setCurrentSession({
            id: response.session_id,
            title: response.session_title || undefined,
          });
        } else if (response.session_title && !currentSession.title) {
          setCurrentSession((s) => s ? { ...s, title: response.session_title } : s);
        }
      } catch (err: any) {
        const msg = err?.response?.data?.detail || 'Something went wrong. Please try again.';
        setError(msg);
        const errMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'I am sorry, I can\'t find a good answer to your request.',
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [currentSession, isLoading, userToken]
  );

  const loadSession = useCallback(
    async (session: Session) => {
      setError(null);
      setIsLoading(true);
      try {
        const msgs = await api.getSessionMessages(session.id, userToken);
        setMessages(msgs);
        setCurrentSession(session);
      } catch {
        setError('Could not load session messages.');
      } finally {
        setIsLoading(false);
      }
    },
    [userToken]
  );

  const startNewChat = useCallback(() => {
    setMessages([]);
    setCurrentSession(null);
    setError(null);
  }, []);

  return {
    messages,
    currentSession,
    isLoading,
    error,
    sendMessage,
    loadSession,
    startNewChat,
  };
}
