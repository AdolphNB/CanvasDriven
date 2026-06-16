export type AgentLayer = 'sandbox' | 'consolidator' | 'master';
export type TargetCanvas = 'draft' | 'master';

export type CanvasEventType =
  | 'node.add'
  | 'node.update'
  | 'node.remove'
  | 'edge.add'
  | 'edge.update'
  | 'edge.remove'
  | 'graph.layout'
  | 'draft.reset'
  | 'branch.fork'
  | 'branch.switch'
  | 'branch.merge'
  | 'commit.patch'
  | 'llm.configured'
  | 'chat.message'
  | 'architect.response';

export type NodeKind = 'concept' | 'decision' | 'module' | 'risk' | 'note';
export type EdgeKind = 'dependency' | 'flow' | 'alternative' | 'commit';

export type CanvasNode = {
  id: string;
  kind: NodeKind;
  label: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
};

export type CanvasEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  kind: EdgeKind;
};

export type CanvasGraph = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  version: number;
};

export type LlmConfig = {
  provider: 'openai' | 'openai_compatible';
  apiMode: 'responses' | 'chat_completions';
  model: string;
  apiKey?: string | null;
  baseUrl?: string | null;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
};

export type ArchitectResponse = {
  assistantMessage: string;
  mermaidCode: string;
  architectureSummary: string;
};

export type CanvasEvent = {
  id: string;
  sessionId: string;
  layer: AgentLayer;
  targetCanvas: TargetCanvas;
  type: CanvasEventType;
  payload: unknown;
  createdAt: string;
};

export type SessionSnapshot = {
  sessionId: string;
  draftGraph: CanvasGraph;
  masterGraph: CanvasGraph;
  branchGraphs: Record<string, CanvasGraph>;
  activeBranch: string | null;
  prdDraft: Record<string, unknown>;
  messages: ChatMessage[];
  llmConfig: LlmConfig;
  currentMermaid: string;
  architectureSummary: string;
};

export type ClientCommand =
  | { type: 'text.submit'; text: string }
  | { type: 'chat.submit'; text: string }
  | { type: 'llm.configure'; llmConfig: LlmConfig }
  | { type: 'draft.reset' }
  | { type: 'commit' }
  | { type: 'branch.fork'; branchName: string }
  | { type: 'branch.switch'; branchName: string }
  | { type: 'branch.merge'; branchName: string };
