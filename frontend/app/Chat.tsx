import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Message } from './Message';

const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/agent';

export function Chat() {
  const [input, setInput] = useState('');

  const {
    messages,
    sendMessage,
    status,
  } = useChat({
    transport: new DefaultChatTransport({
      api: apiUrl,
    }),
  });

  // AI SDK v7 exposes `ready`, `submitted`, `streaming`, and `error`.
  // A failed request is not loading, so allow the user to submit again from
  // the error state without requiring a page refresh.
  const isLoading = status === 'streaming' || status === 'submitted';
  const canSubmit = !isLoading && input.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    void sendMessage({ text: input });
    setInput('');
  };

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center', marginBottom: '30px' }}>
        🧭 DomainAtlas
      </h1>

      <div style={{
        height: '500px',
        overflowY: 'auto',
        border: '1px solid #ccc',
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '16px',
        backgroundColor: '#fafafa'
      }}>
        {messages.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: '#666',
            padding: '40px 0'
          }}>
            👋 Tell me about a field you want to understand.
            <br /><br />
            Include your background, goal, and available time so we can build a focused first map.
          </div>
        )}

        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
          />
        ))}

        {isLoading && (
          <div style={{
            padding: '12px',
            color: '#666',
            fontStyle: 'italic'
          }}>
            🤖 Thinking...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What field do you want to understand?"
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '12px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '16px'
          }}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: '12px 24px',
            backgroundColor: canSubmit ? '#007bff' : '#ccc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontSize: '16px'
          }}
        >
          {isLoading ? '⏳' : 'Send'}
        </button>
      </form>

      <div style={{
        marginTop: '16px',
        fontSize: '14px',
        color: '#666',
        textAlign: 'center'
      }}>
        Powered by DomainAtlas · AI SDK v7 + Pydantic-AI
      </div>
    </div>
  );
}
