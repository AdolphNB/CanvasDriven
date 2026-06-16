from __future__ import annotations

from datetime import datetime, timezone
from enum import StrEnum
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AgentLayer(StrEnum):
    SANDBOX = "sandbox"
    CONSOLIDATOR = "consolidator"
    MASTER = "master"


class TargetCanvas(StrEnum):
    DRAFT = "draft"
    MASTER = "master"


class CanvasEventType(StrEnum):
    NODE_ADD = "node.add"
    NODE_UPDATE = "node.update"
    NODE_REMOVE = "node.remove"
    EDGE_ADD = "edge.add"
    EDGE_UPDATE = "edge.update"
    EDGE_REMOVE = "edge.remove"
    GRAPH_LAYOUT = "graph.layout"
    DRAFT_RESET = "draft.reset"
    BRANCH_FORK = "branch.fork"
    BRANCH_SWITCH = "branch.switch"
    BRANCH_MERGE = "branch.merge"
    COMMIT_PATCH = "commit.patch"
    LLM_CONFIGURED = "llm.configured"
    CHAT_MESSAGE = "chat.message"
    ARCHITECT_RESPONSE = "architect.response"


class NodeKind(StrEnum):
    CONCEPT = "concept"
    DECISION = "decision"
    MODULE = "module"
    RISK = "risk"
    NOTE = "note"


class EdgeKind(StrEnum):
    DEPENDENCY = "dependency"
    FLOW = "flow"
    ALTERNATIVE = "alternative"
    COMMIT = "commit"


class Position(BaseModel):
    x: float
    y: float


class CanvasNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: NodeKind
    label: str
    data: dict[str, Any] = Field(default_factory=dict)
    position: Position


class CanvasEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    source: str
    target: str
    label: str | None = None
    kind: EdgeKind


class CanvasGraph(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nodes: list[CanvasNode] = Field(default_factory=list)
    edges: list[CanvasEdge] = Field(default_factory=list)
    version: int = 0


PatchOp = Literal["add", "replace", "remove"]


class PatchOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: PatchOp
    path: str
    value: Any | None = None

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        allowed = ("/master_graph/nodes", "/master_graph/edges", "/prd_draft")
        if not value.startswith(allowed):
            raise ValueError("patch path must target master_graph or prd_draft")
        return value


class CommitPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sourceDraftVersion: int
    operations: list[PatchOperation]
    summary: str


class LLMConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: Literal["openai", "openai_compatible"] = "openai"
    apiMode: Literal["responses", "chat_completions"] = "responses"
    model: str = "gpt-5.2"
    apiKey: str | None = None
    baseUrl: str | None = None


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ArchitectResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assistantMessage: str
    mermaidCode: str
    architectureSummary: str


class CanvasEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(default_factory=lambda: str(uuid4()))
    sessionId: str
    layer: AgentLayer
    targetCanvas: TargetCanvas
    type: CanvasEventType
    payload: Any
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ClientCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal[
        "text.submit",
        "draft.reset",
        "commit",
        "branch.fork",
        "branch.switch",
        "branch.merge",
        "llm.configure",
        "chat.submit",
    ]
    text: str | None = None
    branchName: str | None = None
    llmConfig: LLMConfig | None = None
