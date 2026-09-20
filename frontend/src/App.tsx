import { Bot, Home, RefreshCw, Send } from 'lucide-react';
import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DownloadButton } from './components/DownloadButton';
import { PaymentModal } from './components/PaymentModal';
import { PricingModal } from './components/PricingModal';
import { MermaidPane } from './MermaidPane';
import type { DownloadFormat, PaymentOrder, PricingOption } from './paymentTypes';
import { exportDiagram } from './utils/exportDiagram';
import { useCanvasStore, resetReconnect, initialMermaid } from './store';

export function App() {
  const [text, setText] = useState('');
  const promptRef = useRef<HTMLTextAreaElement | null>(null);
  const followMessages = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const [notice, setNotice] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [diagramReady, setDiagramReady] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const {
    architectureSummary,
    connect,
    connectionState,
    currentMermaid,
    eventLog,
    isThinking,
    requestError,
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
    if (element && followMessages.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages, streamingAssistantText, isThinking]);

  const recentEvents = useMemo(() => eventLog.slice(-8).reverse(), [eventLog]);

  const [showPricing, setShowPricing] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<PaymentOrder | null>(null);
  const [pendingExport, setPendingExport] = useState<{ format: DownloadFormat; watermark: boolean } | null>(null);

  const canDownload = currentMermaid !== initialMermaid && diagramReady && !isThinking && !exportBusy;

  function handleDownloadClick() {
    setShowPricing(true);
  }

  async function handlePricingSelect(option: PricingOption, format: DownloadFormat) {
    setShowPricing(false);
    setNotice('');
    setExportBusy(true);
    if (option.id === "free") {
      try {
        await exportDiagram({ format, watermark: true });
      } catch {
        setNotice("导出失败，请重试下载。");
      }
      setExportBusy(false);
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
      if (!resp.ok) throw new Error("创建订单失败");
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
      setNotice("创建订单失败，请稍后重试。");
    } finally {
      setExportBusy(false);
    }
  }

  const handlePaymentSuccess = useCallback(async () => {
    if (!pendingExport) {
      setPaymentOrder(null);
      return;
    }
    try {
      await exportDiagram({ format: pendingExport.format, watermark: false });
    } catch {
      setNotice("导出失败，请重试下载。");
    }
    setPaymentOrder(null);
    setPendingExport(null);
  }, [pendingExport]);

  function handlePaymentTimeout() {
    setPaymentOrder(null);
    setPendingExport(null);
    setShowPricing(true);
  }

  function submitPrompt() {
    if (!text.trim() || isThinking || connectionState !== 'connected') return;
    if (sendCommand({ type: 'chat.submit', text: text.trim() })) {
      followMessages.current = true;
      setShowLatest(false);
      setText('');
      promptRef.current?.focus();
    }
  }

  function submitText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitPrompt();
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submitPrompt();
  }

  return (
    <main className="app-shell">
      <header className="command-bar">
        <div className="brand">
          <a aria-label="主页（新窗口打开）" className="home-link" href="https://singularitynear.com" target="_blank" rel="noopener noreferrer">
            <Home size={16} />
            <span>主页</span>
          </a>
          <div className="brand-mark">
            <Bot size={20} />
          </div>
          <div>
            <h1>CanvasDriven</h1>
            <p className={`conn-state conn-${connectionState}`}>
              {connectionState === 'connecting' ? '连接中…' : connectionState === 'connected' ? '已连接' : '连接已断开，正在自动重连'}
              {connectionState === 'disconnected' && (
                <button type="button" className="reconnect-btn" onClick={() => { resetReconnect(); connect(); }}>
                  <RefreshCw size={12} /> 重连
                </button>
              )}
            </p>
          </div>
        </div>
        <DownloadButton disabled={!canDownload} onClick={handleDownloadClick} />
      </header>

      {(notice || exportBusy) && <div className="feedback" role="status">{exportBusy ? '正在准备下载，请稍候…' : notice}</div>}
      <div className="workspace">
        <section className="chat-panel">
          <div className="panel-header">
            <span className="eyebrow">从想法到架构</span>
            <h2>需求讨论</h2>
          </div>
          <div className="messages" ref={messagesRef} aria-label="需求讨论记录" onScroll={() => {
            const element = messagesRef.current;
            if (!element) return;
            followMessages.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
            setShowLatest(!followMessages.current);
          }}>
            {messages.length === 0 && !streamingAssistantText && (
              <div className="empty-state">
                <h3>你想构建怎样的系统？</h3>
                <p>描述目标、规模和技术约束，一起讨论方案，逐步生成架构图。</p>
                <div className="starter-prompts">
                  {['设计一个支持库存和支付的电商系统', '设计日活十万的实时聊天系统', '帮我梳理一个知识库问答系统的架构'].map((example) => (
                    <button type="button" key={example} onClick={() => { setText(example); promptRef.current?.focus(); }}>{example}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <article className={`message message-${message.role}`} key={`${message.createdAt}-${index}`}>
                <span>{message.role === 'user' ? '你' : '架构助手'}</span>
                <p>{message.content}</p>
              </article>
            ))}
            {streamingAssistantText && (
              <article className="message message-assistant message-streaming">
                <span>架构助手</span>
                <p>{streamingAssistantText}</p>
              </article>
            )}
            {isThinking && !streamingAssistantText && <div className="thinking" role="status">正在梳理需求并生成架构，请稍候…</div>}
          </div>

          {showLatest && <button className="latest-button" type="button" onClick={() => {
            followMessages.current = true;
            setShowLatest(false);
            const element = messagesRef.current;
            if (element) element.scrollTop = element.scrollHeight;
          }}>回到最新消息 ↓</button>}
          {requestError && <p className="request-error" role="alert">{requestError}</p>}
          <form className="prompt-bar" onSubmit={submitText}>
            <textarea
              ref={promptRef}
              aria-label="架构需求"
              aria-describedby="prompt-hint"
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder="描述你的系统目标，或继续追问方案…"
            />
            <button type="submit" disabled={!text.trim() || isThinking || connectionState !== 'connected'}>
              <Send size={17} />
              {isThinking ? '生成中' : '发送'}
            </button>
          </form>
          <p className="prompt-hint" id="prompt-hint">{connectionState !== 'connected' ? '连接恢复后可发送，仍可继续编辑需求。' : 'Enter 发送 · Shift + Enter 换行'}</p>
        </section>

        <MermaidPane code={currentMermaid} onReadyChange={setDiagramReady} />
      </div>

      <section className="status-strip">
        <div>
          <span className="eyebrow">方案摘要</span>
          <p>{architectureSummary}</p>
        </div>
        <details className="event-strip"><summary>运行记录</summary>
          {recentEvents.map((event) => (
            <span key={event.id}>{event.type}</span>
          ))}
        </details>
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
