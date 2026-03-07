import React, { useEffect } from 'react';
import { SidePanel } from './SidePanel';
import { ChatPanel } from './ChatPanel';
import { useChat } from '../hooks/useChat';
import { useSessions } from '../hooks/useSessions';

interface ChatWidgetProps {
  userToken: string;
  onClose: () => void;
}

export const ChatWidget: React.FC<ChatWidgetProps> = ({ userToken, onClose }) => {
  const {
    messages,
    currentSession,
    isLoading,
    error,
    sendMessage,
    loadSession,
    startNewChat,
  } = useChat(userToken);

  const { sessions, refresh, deleteSession, search } = useSessions(userToken);

  // Refresh session list after a message is sent
  const handleSend = async (content: string) => {
    await sendMessage(content);
    refresh();
  };

  const handleNewChat = () => {
    startNewChat();
    refresh();
  };

  const handleDeleteSession = async (sessionId: string) => {
    await deleteSession(sessionId);
    if (currentSession?.id === sessionId) {
      startNewChat();
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden rounded-xl shadow-2xl border border-gray-200 bg-white">
      {/* Left panel — fixed, does NOT scroll */}
      <SidePanel
        sessions={sessions}
        currentSessionId={currentSession?.id}
        onNewChat={handleNewChat}
        onSelectSession={loadSession}
        onDeleteSession={handleDeleteSession}
        onClose={onClose}
        onSearch={search}
      />

      {/* Right panel — chat area, messages scroll independently */}
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        error={error}
        onSend={handleSend}
        onNewChat={handleNewChat}
      />
    </div>
  );
};
