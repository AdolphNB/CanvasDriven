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

type CanvasStore = {
  sessionId: string;
  connectionState: ConnectionState;
  draftGraph: CanvasGraph;
  masterGraph: CanvasGraph;
  branchGraphs: Record<string, CanvasGraph>;
  activeBranch: string | null;
  messages: ChatMessage[];
  llmConfig: LlmConfig;
  currentMermaid: string;
  architectureSummary: string;
  isThinking: boolean;
  eventLog: CanvasEvent[];
  socket: WebSocket | null;
  connect: () => void;
  sendCommand: (command: ClientCommand) => void;
  applyEvent: (event: CanvasEvent) => void;
  applySnapshot: (snapshot: SessionSnapshot) => void;
};

const initialSessionId = globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}`;
const initialMermaid = 'flowchart LR\n  User[User requirement] --> Architect[Architect discussion]\n  Architect --> Mermaid[Mermaid architecture]';

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  sessionId: initialSessionId,
  connectionState: 'disconnected',
  draftGraph: emptyGraph(),
  masterGraph: emptyGraph(),
  branchGraphs: {},
  activeBranch: null,
  messages: [],
  llmConfig: { provider: 'openai', apiMode: 'responses', model: 'gpt-5.2', apiKey: null, baseUrl: null },
  currentMermaid: initialMermaid,
  architectureSummary: 'Waiting for the first architecture discussion.',
  isThinking: false,
  eventLog: [],
  socket: null,
  connect: () => {
    const { socket, sessionId } = get();
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

    set({ connectionState: 'connecting' });
    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${sessionId}`);
    ws.onopen = () => set({ connectionState: 'connected' });
    ws.onclose = () => set({ connectionState: 'disconnected', socket: null, isThinking: false });
    ws.onerror = () => set({ connectionState: 'disconnected', isThinking: false });
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
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (command.type === 'chat.submit') set({ isThinking: true });
    socket.send(JSON.stringify(command));
  },
  applySnapshot: (snapshot) => {
    set({
      sessionId: snapshot.sessionId,
      draftGraph: layoutGraph(snapshot.draftGraph),
      masterGraph: layoutGraph(snapshot.masterGraph),
      branchGraphs: snapshot.branchGraphs,
      activeBranch: snapshot.activeBranch,
      messages: snapshot.messages ?? [],
      llmConfig: snapshot.llmConfig ?? { provider: 'openai', apiMode: 'responses', model: 'gpt-5.2', apiKey: null, baseUrl: null },
      currentMermaid: snapshot.currentMermaid ?? initialMermaid,
      architectureSummary: snapshot.architectureSummary ?? 'Waiting for the first architecture discussion.',
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
        return { messages: state.messages.concat(event.payload as ChatMessage), eventLog: state.eventLog.concat(event) };
      }
      if (event.type === 'architect.response') {
        const payload = event.payload as ArchitectResponse;
        return {
          messages: state.messages.concat({
            role: 'assistant',
            content: payload.assistantMessage,
            createdAt: event.createdAt,
          }),
          currentMermaid: payload.mermaidCode,
          architectureSummary: payload.architectureSummary,
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
