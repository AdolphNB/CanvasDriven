import { Bot, Download, Send } from 'lucide-react';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DownloadButton } from './components/DownloadButton';
import { PaymentModal } from './components/PaymentModal';
import { PricingModal } from './components/PricingModal';
import { MermaidPane } from './MermaidPane';
import { PRICING_OPTIONS } from './paymentTypes';
import type { DownloadFormat, PaymentOrder, PricingOption } from './paymentTypes';
import { exportDiagram } from './utils/exportDiagram';
import { useCanvasStore } from './store';

export function App() {
  const [text, setText] = useState('');
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

  const [showPricing, setShowPricing] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [pendingExport, setPendingExport] = useState<{ format: DownloadFormat; watermark: boolean } | null>(null);

  const DEFAULT_MERMAID = 'flowchart LR\n  User[User requirement] --> Architect[Architect discussion]\n  Architect --> Mermaid[Mermaid architecture]';
  const canDownload = currentMermaid !== DEFAULT_MERMAID;

  function handleDownloadClick() {
    setShowPricing(true);
  }

  async function handlePricingSelect(option: PricingOption, format: DownloadFormat) {
    setShowPricing(false);
    if (option.id === "free") {
      try {
        await exportDiagram({ format, watermark: true });
      } catch {
        alert("导出失败，请重试");
      }
      return;
    }

    try {
      const resp = await fetch("/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          amount: option.amount,
          goodsName: option.goodsName,
          format,
          watermark: option.watermark,
        }),
      });
      const data = await resp.json();
      setPaymentOrder({
        orderId: data.orderId,
        amount: data.amount,
        format: data.format,
        watermark: data.watermark,
        wechatUrl: data.wechatUrl,
      });
      setPendingExport({ format, watermark: false });
    } catch {
      alert("创建订单失败，请重试");
    }
  }

  const handlePaymentSuccess = useCallback(async () => {
    setPaymentOrder(null);
    if (pendingExport) {
      try {
        await exportDiagram({ format: pendingExport.format, watermark: false });
      } catch {
        alert("导出失败，请重试");
      }
      setPendingExport(null);
    }
  }, [pendingExport]);

  function handlePaymentTimeout() {
    setPaymentOrder(null);
    setPendingExport(null);
    setShowPricing(true);
  }

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
        <DownloadButton disabled={!canDownload} onClick={handleDownloadClick} />
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
                说明你的系统目标、约束或疑问。Agent 会以资深架构师视角讨论方案，并生成 Mermaid 架构图。
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

      {showPricing && (
        <PricingModal onSelect={handlePricingSelect} onClose={() => setShowPricing(false)} />
      )}
      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          onSuccess={handlePaymentSuccess}
          onTimeout={handlePaymentTimeout}
          onClose={() => { setPaymentOrder(null); setPendingExport(null); }}
        />
      )}
    </main>
  );
}
