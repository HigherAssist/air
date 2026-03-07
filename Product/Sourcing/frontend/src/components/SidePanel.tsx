import React, { useState, useCallback } from 'react';
import { format } from 'date-fns';
import type { Session } from '../types';

interface SidePanelProps {
  sessions: Session[];
  currentSessionId?: string;
  onNewChat: () => void;
  onSelectSession: (session: Session) => void;
  onDeleteSession: (sessionId: string) => void;
  onClose: () => void;
  onSearch: (query: string) => Promise<Session[]>;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  sessions,
  currentSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onClose,
  onSearch,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    const results = await onSearch(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  }, [searchQuery, onSearch]);

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
  };

  const displaySessions = searchResults !== null ? searchResults : sessions;

  // Group sessions by month
  const grouped: Record<string, Session[]> = {};
  displaySessions.forEach((s) => {
    const key = s.last_activity_at
      ? format(new Date(s.last_activity_at), 'MMMM yyyy')
      : 'Earlier';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  });

  return (
    <div className="w-64 flex-shrink-0 flex flex-col bg-gray-50 border-r border-gray-200 h-full">
      {/* Top actions */}
      <div className="p-3 space-y-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 bg-brand text-white rounded-lg py-2 px-3 text-sm font-medium hover:bg-brand-dark transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>

        {/* Search */}
        <div className="flex gap-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search chats..."
            className="flex-1 text-xs border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand bg-white"
          />
          {searchQuery ? (
            <button
              onClick={clearSearch}
              className="text-gray-400 hover:text-gray-600 px-1"
              title="Clear search"
            >
              ×
            </button>
          ) : (
            <button
              onClick={handleSearch}
              disabled={isSearching}
              className="text-brand hover:text-brand-dark px-1"
              title="Search chats"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto px-2">
        {searchResults !== null && searchResults.length === 0 && (
          <p className="text-xs text-gray-400 text-center mt-4">No chats found.</p>
        )}
        {Object.entries(grouped).map(([month, group]) => (
          <div key={month} className="mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 mb-1">
              {month}
            </p>
            {group.map((session) => (
              <div
                key={session.id}
                className={`group relative flex items-start rounded-lg px-2 py-1.5 cursor-pointer mb-0.5 transition-colors ${
                  session.id === currentSessionId
                    ? 'bg-brand/10 text-brand-dark'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
                onClick={() => onSelectSession(session)}
              >
                <span className="text-xs truncate flex-1 leading-tight">
                  {session.title || 'New conversation'}
                </span>
                <button
                  className="opacity-0 group-hover:opacity-100 ml-1 text-gray-400 hover:text-red-500 flex-shrink-0 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  title="Delete"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ))}
        {displaySessions.length === 0 && searchResults === null && (
          <p className="text-xs text-gray-400 text-center mt-8 px-4">
            No chat history yet. Start a new conversation above.
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-3 space-y-2">
        <p className="text-xs text-gray-400 leading-tight">
          AI may produce inaccurate results. Your use of this product must be consistent with our{' '}
          <a
            href="https://www.hireassist.net/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand underline hover:text-brand-dark"
          >
            AI and privacy policy
          </a>
          .
        </p>
        <button
          onClick={onClose}
          className="w-full text-sm text-gray-600 border border-gray-300 rounded-lg py-1.5 hover:bg-gray-100 transition-colors"
        >
          Close AIR
        </button>
      </div>
    </div>
  );
};
