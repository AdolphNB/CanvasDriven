from __future__ import annotations

import re
from typing import TypedDict

from langgraph.graph import END, StateGraph

from .models import CanvasEdge, CanvasEvent, CanvasNode, CommitPatch, EdgeKind, NodeKind, PatchOperation, Position
from .state import SessionState


class AgentGraphState(TypedDict):
    session_id: str
    text: str
    events: list[dict[str, object]]
    patch: dict[str, object] | None


def build_agent_state_graph():
    graph = StateGraph(AgentGraphState)
    graph.add_node("sandbox", lambda state: state)
    graph.add_node("consolidator", lambda state: state)
    graph.add_node("master", lambda state: state)
    graph.set_entry_point("sandbox")
    graph.add_edge("sandbox", "consolidator")
    graph.add_edge("consolidator", "master")
    graph.add_edge("master", END)
    return graph.compile()


agent_state_graph = build_agent_state_graph()


def split_mock_asr_chunks(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text.strip())
    if not normalized:
        return []
    chunks = re.split(r"\s*(?:,|;|\n|，|；|。)\s*", normalized)
    return [chunk.strip(" .!?！？") for chunk in chunks if chunk.strip(" .!?！？")]


def classify_node_kind(chunk: str) -> NodeKind:
    lowered = chunk.lower()
    if any(keyword in lowered for keyword in ["risk", "risky", "latency", "failure"]):
        return NodeKind.RISK
    if any(keyword in lowered for keyword in ["decide", "decision", "choose", "selected"]):
        return NodeKind.DECISION
    if any(keyword in lowered for keyword in ["module", "service", "agent", "api", "gateway", "worker"]):
        return NodeKind.MODULE
    return NodeKind.CONCEPT


def sandbox_events_for_text(state: SessionState, text: str) -> list[CanvasEvent]:
    chunks = split_mock_asr_chunks(text)
    graph = state.active_draft_graph
    base_index = len(graph.nodes)
    previous_id = graph.nodes[-1].id if graph.nodes else None
    events: list[CanvasEvent] = []

    for offset, chunk in enumerate(chunks):
        node_id = f"draft-{graph.version}-{base_index + offset}-{slugify(chunk)}"
        node = CanvasNode(
            id=node_id,
            kind=classify_node_kind(chunk),
            label=chunk,
            data={"source": "mock_asr", "activeBranch": state.active_branch},
            position=Position(x=80 + ((base_index + offset) % 3) * 220, y=80 + ((base_index + offset) // 3) * 150),
        )
        events.append(
            CanvasEvent(
                sessionId=state.id,
                layer="sandbox",
                targetCanvas="draft",
                type="node.add",
                payload=node.model_dump(mode="json"),
            )
        )

        if previous_id is not None:
            edge = CanvasEdge(
                id=f"edge-{previous_id}-{node_id}",
                source=previous_id,
                target=node_id,
                label="continues",
                kind=EdgeKind.FLOW,
            )
            events.append(
                CanvasEvent(
                    sessionId=state.id,
                    layer="sandbox",
                    targetCanvas="draft",
                    type="edge.add",
                    payload=edge.model_dump(mode="json"),
                )
            )
        previous_id = node_id

    return events


def consolidate_to_patch(state: SessionState, summary_prefix: str = "Committed draft decisions") -> CommitPatch:
    graph = state.active_draft_graph
    operations: list[PatchOperation] = []
    existing_nodes = {node.id for node in state.master_graph.nodes}
    existing_edges = {edge.id for edge in state.master_graph.edges}

    for node in graph.nodes:
        master_node = node.model_copy(
            update={
                "id": f"master-{node.id}" if not node.id.startswith("master-") else node.id,
                "data": {**node.data, "committedFrom": state.active_branch or "draft"},
            },
            deep=True,
        )
        if master_node.id not in existing_nodes:
            operations.append(
                PatchOperation(op="add", path="/master_graph/nodes/-", value=master_node.model_dump(mode="json"))
            )

    for edge in graph.edges:
        source = f"master-{edge.source}" if not edge.source.startswith("master-") else edge.source
        target = f"master-{edge.target}" if not edge.target.startswith("master-") else edge.target
        master_edge = edge.model_copy(
            update={
                "id": f"master-{edge.id}" if not edge.id.startswith("master-") else edge.id,
                "source": source,
                "target": target,
                "kind": EdgeKind.COMMIT,
            },
            deep=True,
        )
        if master_edge.id not in existing_edges:
            operations.append(
                PatchOperation(op="add", path="/master_graph/edges/-", value=master_edge.model_dump(mode="json"))
            )

    operations.append(
        PatchOperation(
            op="add",
            path="/prd_draft/decisions/-",
            value={
                "summary": f"{summary_prefix}: {len(graph.nodes)} nodes, {len(graph.edges)} edges",
                "sourceDraftVersion": graph.version,
                "branch": state.active_branch,
            },
        )
    )
    return CommitPatch(sourceDraftVersion=graph.version, operations=operations, summary=summary_prefix)


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff]+", "-", value).strip("-").lower()
    return slug[:24] or "node"
