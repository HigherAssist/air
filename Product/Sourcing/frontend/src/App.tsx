import React, { useState, useEffect } from 'react';
import { ChatWidget } from './components/ChatWidget';
import './index.css';

/**
 * The AIR Sourcing chatbot frontend.
 *
 * When embedded in the AIR app as an iframe, the user's token (dbUser.id)
 * is passed as a URL query parameter: ?token=<uuid>
 *
 * Standalone access (direct URL) also works — the token defaults to 'anonymous'
 * which is fine for local development.
 */
function getTokenFromUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || 'anonymous';
}

const App: React.FC = () => {
  const [userToken] = useState<string>(getTokenFromUrl);
  const [isOpen, setIsOpen] = useState(true); // Full-screen in iframe mode

  // If this page is NOT inside an iframe, show the standalone widget
  const isIframe = window.self !== window.top;

  if (isIframe || isOpen) {
    // Fill the entire iframe/window
    return (
      <div className="h-screen w-screen bg-gray-100 flex items-stretch">
        <ChatWidget userToken={userToken} onClose={() => window.parent.postMessage({ type: 'close-air' }, '*')} />
      </div>
    );
  }

  // Standalone: floating button that opens the widget
  return (
    <div className="h-screen w-screen bg-gray-100 flex items-end justify-end p-6">
      <button
        onClick={() => setIsOpen(true)}
        className="w-14 h-14 rounded-full bg-brand shadow-lg flex items-center justify-center hover:bg-brand-dark transition-colors"
        title="Open AIR Sourcing Assistant"
      >
        <span className="text-white text-sm font-bold">AIR</span>
      </button>
    </div>
  );
};

export default App;
