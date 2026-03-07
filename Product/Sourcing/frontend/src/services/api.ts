import axios from 'axios';
import type { ChatRequest, ChatResponse, Message, Session } from '../types';

const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}` : '/api';

const http = axios.create({ baseURL: BASE, timeout: 20000 });

export const api = {
  sendMessage: async (req: ChatRequest): Promise<ChatResponse> => {
    const { data } = await http.post<ChatResponse>('/chat', req);
    return data;
  },

  listSessions: async (userToken: string): Promise<Session[]> => {
    const { data } = await http.get<Session[]>('/chat/sessions', {
      params: { user_token: userToken },
    });
    return data;
  },

  getSessionMessages: async (sessionId: string, userToken: string): Promise<Message[]> => {
    const { data } = await http.get<Message[]>(`/chat/sessions/${sessionId}/messages`, {
      params: { user_token: userToken },
    });
    return data;
  },

  deleteSession: async (sessionId: string, userToken: string): Promise<void> => {
    await http.delete(`/chat/sessions/${sessionId}`, {
      params: { user_token: userToken },
    });
  },

  searchSessions: async (userToken: string, query: string): Promise<Session[]> => {
    const { data } = await http.post<Session[]>('/chat/search', { user_token: userToken, query });
    return data;
  },
};
