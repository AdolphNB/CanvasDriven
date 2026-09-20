import { create } from 'zustand';
import { applyEventToGraph, emptyGraph } from './graphReducer';
import { layoutGraph } from './layout';
import type {
  ArchitectResponse,
  CanvasEvent,
  CanvasGraph,
  ChatMessage,
  ClientCommand,
  LlmConfig,
  SessionSnapshot,
} from './types';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const THINKING_TIMEOUT_MS = 60_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

type CanvasStore = {
  sessionId: string;
  connectionState: ConnectionState;
  draftGraph: CanvasGraph;
  masterGraph: CanvasGraph;
  branchGraphs: Record<string, CanvasGraph>;
  activeBranch: string | null;
  messages: ChatMessage[];
  pendingUserMessages: ChatMessage[];
  llmConfig: LlmConfig;
  currentMermaid: string;
  architectureSummary: string;
  streamingAssistantText: string;
  isThinking: boolean;
  requestError: string | null;
  eventLog: CanvasEvent[];
  socket: WebSocket | null;
  connect: () => void;
  sendCommand: (command: ClientCommand) => boolean;
  applyEvent: (event: CanvasEvent) => void;
  applySnapshot: (snapshot: SessionSnapshot) => void;
};

const initialSessionId = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`;
export const initialMermaid = 'flowchart LR\n  User[User requirement] --> Architect[Architect discussion]\n  Architect --> Mermaid[Mermaid architecture]';

let thinkingTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let intentionalClose = false;

function startThinkingTimeout(set: (partial: Partial<CanvasStore>) => void): void {
  clearThinkingTimeout();
  thinkingTimer = setTimeout(() => {
    set({ isThinking: false, requestError: '回复等待超时。你可以继续等待，或重新发送需求。' });
  }, THINKING_TIMEOUT_MS);
}

function clearThinkingTimeout(): void {
  if (thinkingTimer !== null) {
    clearTimeout(thinkingTimer);
    thinkingTimer = null;
  }
}

function scheduleReconnect(connect: () => void): void {
  if (intentionalClose) return;
  if (reconnectTimer !== null) return;
  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS);
  const jitter = Math.random() * 500;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempt += 1;
    connect();
  }, delay + jitter);
}

function clearReconnect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

export function resetReconnect(): void {
  reconnectAttempt = 0;
  clearReconnect();
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  sessionId: initialSessionId,
  connectionState: 'disconnected',
  draftGraph: emptyGraph(),
  masterGraph: emptyGraph(),
  branchGraphs: {},
  activeBranch: null,
  messages: [],
  pendingUserMessages: [],
  llmConfig: { provider: 'openai', apiMode: 'responses', model: 'gpt-5.2', apiKey: null, baseUrl: null },
  currentMermaid: initialMermaid,
  architectureSummary: '开始讨论后，这里会展示方案摘要。',
  streamingAssistantText: '',
  isThinking: false,
  requestError: null,
  eventLog: [],
  socket: null,
  connect: () => {
    const { socket, sessionId } = get();
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

    intentionalClose = false;
    set({ connectionState: 'connecting' });
    const wsProto = globalThis.location?.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${globalThis.location?.host}/ws/${sessionId}`);
    ws.onopen = () => {
      reconnectAttempt = 0;
      set({ connectionState: 'connected' });
    };
    ws.onclose = () => {
      clearThinkingTimeout();
      set({ connectionState: 'disconnected', socket: null, isThinking: false, requestError: get().isThinking ? '连接中断，回复可能不完整。连接恢复后可重新发送需求。' : get().requestError });
      scheduleReconnect(get().connect);
    };
    ws.onerror = () => {
      clearThinkingTimeout();
      set({ connectionState: 'disconnected', isThinking: false, requestError: '连接异常，正在尝试恢复。' });
    };
    ws.onmessage = (message) => {
      const parsed = JSON.parse(message.data);
      if (parsed.type === 'session.snapshot') {
        get().applySnapshot(parsed.payload as SessionSnapshot);
      } else {
        get().applyEvent(parsed as CanvasEvent);
      }
    };
    set({ socket: ws });
  },
  sendCommand: (command) => {
    const { socket } = get();
    if (socket?.readyState !== WebSocket.OPEN) {
      set({ requestError: '消息未发送，请等待连接恢复后重试。' });
      return false;
    }
    try {
      socket.send(JSON.stringify(command));
      if (command.type === 'chat.submit') {
        const message: ChatMessage = {
          role: 'user',
          content: command.text,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          messages: state.messages.concat(message),
          pendingUserMessages: state.pendingUserMessages.concat(message),
          isThinking: true,
          streamingAssistantText: '',
          requestError: null,
        }));
        startThinkingTimeout(set);
      }
      return true;
    } catch {
      set({ requestError: '消息未发送，请检查连接后重试。' });
      return false;
    }
  },
  applySnapshot: (snapshot) => {
    set({
      sessionId: snapshot.sessionId,
      draftGraph: layoutGraph(snapshot.draftGraph),
      masterGraph: layoutGraph(snapshot.masterGraph),
      branchGraphs: snapshot.branchGraphs,
      activeBranch: snapshot.activeBranch,
      messages: snapshot.messages ?? [],
      pendingUserMessages: [],
      llmConfig: snapshot.llmConfig ?? { provider: 'openai', apiMode: 'responses', model: 'gpt-5.2', apiKey: null, baseUrl: null },
      currentMermaid: snapshot.currentMermaid ?? initialMermaid,
      architectureSummary: snapshot.architectureSummary ?? '开始讨论后，这里会展示方案摘要。',
    });
  },
  applyEvent: (event) => {
    set((state) => {
      if (event.type === 'draft.reset') {
        return { draftGraph: emptyGraph(), eventLog: state.eventLog.concat(event), activeBranch: null };
      }
      if (event.type === 'branch.fork' || event.type === 'branch.switch') {
        const payload = event.payload as { branchName: string; graph: CanvasGraph };
        return {
          activeBranch: payload.branchName,
          draftGraph: layoutGraph(payload.graph),
          eventLog: state.eventLog.concat(event),
        };
      }
      if (event.type === 'branch.merge') {
        return { branchGraphs: {}, activeBranch: null, eventLog: state.eventLog.concat(event) };
      }
      if (event.type === 'llm.configured') {
        return { llmConfig: event.payload as LlmConfig, eventLog: state.eventLog.concat(event) };
      }
      if (event.type === 'chat.message') {
        const message = event.payload as ChatMessage;
        // Replace the local echo when the server acknowledges it. Only match
        // pending entries so deliberately repeated prompts remain separate.
        const pending = message.role === 'user'
          ? state.pendingUserMessages.find((item) => item.content === message.content)
          : undefined;
        return {
          messages: pending
            ? state.messages.map((item) => item === pending ? message : item)
            : state.messages.concat(message),
          pendingUserMessages: state.pendingUserMessages.filter((item) => item !== pending),
          eventLog: state.eventLog.concat(event),
        };
      }
      if (event.type === 'architect.delta') {
        startThinkingTimeout(set);
        const payload = event.payload as { content?: string };
        return {
          streamingAssistantText: state.streamingAssistantText + (payload.content ?? ''),
          isThinking: true,
          eventLog: state.eventLog.concat(event),
        };
      }
      if (event.type === 'architect.response') {
        clearThinkingTimeout();
        const payload = event.payload as ArchitectResponse;
        return {
          messages: state.messages.concat({
            role: 'assistant',
            content: payload.assistantMessage,
            createdAt: event.createdAt,
          }),
          requestError: null,
          currentMermaid: payload.mermaidCode,
          architectureSummary: payload.architectureSummary,
          streamingAssistantText: '',
          isThinking: false,
          eventLog: state.eventLog.concat(event),
        };
      }

      if (event.targetCanvas === 'draft') {
        return {
          draftGraph: layoutGraph(applyEventToGraph(state.draftGraph, event)),
          eventLog: state.eventLog.concat(event),
        };
      }
      if (event.targetCanvas === 'master' && event.type !== 'commit.patch') {
        return {
          masterGraph: layoutGraph(applyEventToGraph(state.masterGraph, event)),
          eventLog: state.eventLog.concat(event),
        };
      }
      return { eventLog: state.eventLog.concat(event) };
    });
  },
}));
