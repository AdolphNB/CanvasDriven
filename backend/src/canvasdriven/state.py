from __future__ import annotations

from dataclasses import dataclass, field
from threading import RLock
from uuid import uuid4

from .config import load_llm_config
from .models import CanvasEvent, CanvasGraph, ChatMessage, LLMConfig


@dataclass
class SessionState:
    id: str
    draft_graph: CanvasGraph = field(default_factory=CanvasGraph)
    master_graph: CanvasGraph = field(default_factory=CanvasGraph)
    branch_graphs: dict[str, CanvasGraph] = field(default_factory=dict)
    active_branch: str | None = None
    draft_event_log: list[CanvasEvent] = field(default_factory=list)
    prd_draft: dict[str, object] = field(default_factory=lambda: {"decisions": []})
    messages: list[ChatMessage] = field(default_factory=list)
    llm_config: LLMConfig = field(default_factory=load_llm_config)
    current_mermaid: str = "flowchart LR\n  User[User requirement] --> Architect[Architect discussion]\n  Architect --> Mermaid[Mermaid architecture]"
    architecture_summary: str = "Waiting for the first architecture discussion."

    @property
    def active_draft_graph(self) -> CanvasGraph:
        if self.active_branch is None:
            return self.draft_graph
        return self.branch_graphs[self.active_branch]

    @active_draft_graph.setter
    def active_draft_graph(self, graph: CanvasGraph) -> None:
        if self.active_branch is None:
            self.draft_graph = graph
        else:
            self.branch_graphs[self.active_branch] = graph


class SessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        self._lock = RLock()

    def create(self) -> SessionState:
        with self._lock:
            state = SessionState(id=str(uuid4()))
            self._sessions[state.id] = state
            return state

    def get(self, session_id: str) -> SessionState:
        with self._lock:
            return self._sessions[session_id]

    def get_or_create(self, session_id: str | None = None) -> SessionState:
        with self._lock:
            if session_id and session_id in self._sessions:
                return self._sessions[session_id]
            if session_id:
                state = SessionState(id=session_id)
                self._sessions[session_id] = state
                return state
            return self.create()


store = SessionStore()
