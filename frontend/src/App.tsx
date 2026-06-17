import { Bot, KeyRound, Send, Settings2 } from 'lucide-react';
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MermaidPane } from './MermaidPane';
import { useCanvasStore } from './store';

export function App() {
  const [text, setText] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-5.2');
  const [provider, setProvider] = useState<'openai' | 'openai_compatible'>('openai');
  const [apiMode, setApiMode] = useState<'responses' | 'chat_completions'>('responses');
  const [baseUrl, setBaseUrl] = useState('');
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const {
    architectureSummary,
    connect,
    connectionState,
    currentMermaid,
    eventLog,
    isThinking,
    messages,
    sendCommand,
    sessionId,
    streamingAssistantText,
  } = useCanvasStore();

  useEffect(() => {
    connect();
  }, [connect]);

  useEffect(() => {
    const element = messagesRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, streamingAssistantText, isThinking]);

  const recentEvents = useMemo(() => eventLog.slice(-8).reverse(), [eventLog]);

  function submitPrompt() {
    if (!text.trim() || isThinking || connectionState !== 'connected') return;
    sendCommand({ type: 'chat.submit', text });
    setText('');
  }

  function submitText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitPrompt();
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submitPrompt();
  }

  function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendCommand({
      type: 'llm.configure',
      llmConfig: {
        provider,
        apiMode,
        model,
        apiKey: apiKey || null,
        baseUrl: baseUrl || null,
      },
    });
  }

  return (
    <main className="app-shell">
      <header className="command-bar">
        <div className="brand">
          <div className="brand-mark">
            <Bot size={20} />
          </div>
          <div>
            <h1>CanvasDriven</h1>
            <p>{sessionId.slice(0, 8)} / {connectionState}</p>
          </div>
        </div>

        <form className="llm-config" onSubmit={saveConfig}>
          <Settings2 size={16} />
          <select value={provider} onChange={(event) => setProvider(event.target.value as 'openai' | 'openai_compatible')}>
            <option value="openai">OpenAI</option>
            <option value="openai_compatible">OpenAI Compatible</option>
          </select>
          <select value={apiMode} onChange={(event) => setApiMode(event.target.value as 'responses' | 'chat_completions')}>
            <option value="responses">Responses</option>
            <option value="chat_completions">Chat Completions</option>
          </select>
          <input value={model} onChange={(event) => setModel(event.target.value)} aria-label="Model" />
          {provider === 'openai_compatible' && (
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="Base URL" />
          )}
          <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="API key or use env" type="password" />
          <button type="submit" title="Apply LLM config">
            <KeyRound size={15} />
            Apply
          </button>
        </form>
      </header>

      <div className="workspace">
        <section className="chat-panel">
          <div className="panel-header">
            <span className="eyebrow">Architect Chat</span>
            <h2>需求讨论</h2>
          </div>
          <div className="messages" ref={messagesRef}>
            {messages.length === 0 && !streamingAssistantText && (
              <div className="empty-state">
                说明你的系统目标、约束或疑问。Agent 会以资深架构师角度讨论方案，并生成 Mermaid 架构图。
              </div>
            )}
            {messages.map((message, index) => (
              <article className={`message message-${message.role}`} key={`${message.createdAt}-${index}`}>
                <span>{message.role === 'user' ? 'You' : 'Architect'}</span>
                <p>{message.content}</p>
              </article>
            ))}
            {streamingAssistantText && (
              <article className="message message-assistant message-streaming">
                <span>Architect</span>
                <p>{streamingAssistantText}</p>
              </article>
            )}
            {isThinking && !streamingAssistantText && <div className="thinking">Architect is reasoning and generating Mermaid...</div>}
          </div>

          <form className="prompt-bar" onSubmit={submitText}>
            <textarea
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="Speak or type an architecture idea"
            />
            <button type="submit" disabled={isThinking || connectionState !== 'connected'}>
              <Send size={17} />
              Send
            </button>
          </form>
        </section>

        <MermaidPane code={currentMermaid} />
      </div>

      <section className="status-strip">
        <div>
          <span className="eyebrow">Summary</span>
          <p>{architectureSummary}</p>
        </div>
        <div className="event-strip">
          {recentEvents.map((event) => (
            <span key={event.id}>{event.type}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
