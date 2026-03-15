import React from 'react';
import { MessageList } from './MessageList';
import { InputBox } from './InputBox';
import type { Message } from '../types';

interface ChatPanelProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  onSend: (message: string) => void;
  onNewChat: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLoading,
  error,
  onSend,
  onNewChat,
}) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex-shrink-0">
          {error}
        </div>
      )}

      {/* Scrollable messages — this is the only scrolling panel */}
      <MessageList messages={messages} isLoading={isLoading} />

      {/* Fixed input area at the bottom */}
      <InputBox onSend={onSend} isLoading={isLoading} />
    </div>
  );
};
