import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from '../types';

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
}

const TypingIndicator: React.FC = () => (
  <div className="flex items-start gap-3 mb-4">
    <div className="w-8 h-8 rounded-full bg-brand flex-shrink-0 flex items-center justify-center">
      <span className="text-white text-xs font-bold">AIR</span>
    </div>
    <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3">
      <div className="flex gap-1.5 items-center h-5">
        <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  </div>
);

const MessageBubble: React.FC<{ message: Message }> = ({ message }) => {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%] bg-brand text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-full bg-brand flex-shrink-0 flex items-center justify-center">
        <span className="text-white text-xs font-bold">AIR</span>
      </div>
      <div className="max-w-[80%] bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-800 prose prose-sm prose-pre:bg-gray-200 prose-pre:text-gray-800 max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
    </div>
  );
};

export const MessageList: React.FC<MessageListProps> = ({ messages, isLoading }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 pb-8">
        <div className="w-16 h-16 rounded-full bg-brand/10 flex items-center justify-center mb-4">
          <span className="text-brand text-2xl font-bold">AIR</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">AIR — AI Sourcing Assistant</h2>
        <p className="text-gray-500 text-base">What can I help with today?</p>
        <div className="mt-6 grid grid-cols-1 gap-2 text-left w-full max-w-lg">
          {[
            'What active jobs do you know about?',
            'Show me your top candidates for the Cisco Senior PM role',
            'Show me candidates in the San Francisco area',
          ].map((suggestion) => (
            <p key={suggestion} className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              "{suggestion}"
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
};
