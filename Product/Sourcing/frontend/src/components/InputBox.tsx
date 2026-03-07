import React, { useRef, useCallback, KeyboardEvent } from 'react';

interface InputBoxProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  onNewChat: () => void;
}

export const InputBox: React.FC<InputBoxProps> = ({ onSend, isLoading, onNewChat }) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const value = textareaRef.current?.value.trim();
    if (!value || isLoading) return;
    onSend(value);
    if (textareaRef.current) {
      textareaRef.current.value = '';
      textareaRef.current.style.height = 'auto';
    }
  }, [onSend, isLoading]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="border-t border-gray-200 px-4 pt-3 pb-4 bg-white flex-shrink-0">
      {/* Input area */}
      <div className="relative border border-gray-300 rounded-xl bg-white shadow-sm focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand transition-all">
        <textarea
          ref={textareaRef}
          rows={3}
          placeholder="Ask about candidates, jobs, or matching… (Shift+Enter for new line)"
          className="w-full resize-none px-4 py-3 pr-12 text-sm text-gray-800 placeholder-gray-400 bg-transparent rounded-xl focus:outline-none leading-relaxed"
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          disabled={isLoading}
        />
        {/* Send button — bottom-right corner of textarea */}
        <button
          onClick={handleSend}
          disabled={isLoading}
          className="absolute bottom-3 right-3 w-8 h-8 rounded-lg bg-brand flex items-center justify-center hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Send (Enter)"
        >
          {isLoading ? (
            <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>

      {/* Start New Chat button below input */}
      <div className="mt-2 flex justify-center">
        <button
          onClick={onNewChat}
          className="text-xs text-gray-400 hover:text-brand transition-colors"
        >
          Start New Chat
        </button>
      </div>
    </div>
  );
};
