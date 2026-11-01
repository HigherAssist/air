export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

export interface Session {
  id: string;
  title?: string;
  created_at?: string;
  last_activity_at?: string;
  message_count?: number;
}

export interface ChatRequest {
  message: string;
  session_id?: string;
  user_token: string;
}

export interface ChatResponse {
  session_id: string;
  reply: string;
  session_title?: string;
}
