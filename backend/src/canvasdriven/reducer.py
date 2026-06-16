from __future__ import annotations

from copy import deepcopy
from typing import Iterable

from .models import CanvasEdge, CanvasEvent, CanvasEventType, CanvasGraph, CanvasNode, CommitPatch
from .state import SessionState


def apply_canvas_event(graph: CanvasGraph, event: CanvasEvent) -> CanvasGraph:
    next_graph = graph.model_copy(deep=True)
    payload = event.payload

    match event.type:
        case CanvasEventType.NODE_ADD:
            node = CanvasNode.model_validate(payload)
            next_graph.nodes = [existing for existing in next_graph.nodes if existing.id != node.id]
            next_graph.nodes.append(node)
        case CanvasEventType.NODE_UPDATE:
            node_id = payload["id"]
            next_graph.nodes = [
                node.model_copy(update=payload, deep=True) if node.id == node_id else node
                for node in next_graph.nodes
            ]
        case CanvasEventType.NODE_REMOVE:
            node_id = payload["id"]
            next_graph.nodes = [node for node in next_graph.nodes if node.id != node_id]
            next_graph.edges = [
                edge for edge in next_graph.edges if edge.source != node_id and edge.target != node_id
            ]
        case CanvasEventType.EDGE_ADD:
            edge = CanvasEdge.model_validate(payload)
            node_ids = {node.id for node in next_graph.nodes}
            if edge.source not in node_ids or edge.target not in node_ids:
                raise ValueError("edge endpoints must exist before adding edge")
            next_graph.edges = [existing for existing in next_graph.edges if existing.id != edge.id]
            next_graph.edges.append(edge)
        case CanvasEventType.EDGE_UPDATE:
            edge_id = payload["id"]
            next_graph.edges = [
                edge.model_copy(update=payload, deep=True) if edge.id == edge_id else edge
                for edge in next_graph.edges
            ]
        case CanvasEventType.EDGE_REMOVE:
            edge_id = payload["id"]
            next_graph.edges = [edge for edge in next_graph.edges if edge.id != edge_id]
        case CanvasEventType.GRAPH_LAYOUT:
            positions = payload.get("positions", {})
            next_graph.nodes = [
                node.model_copy(update={"position": positions[node.id]}, deep=True)
                if node.id in positions
                else node
                for node in next_graph.nodes
            ]
        case _:
            raise ValueError(f"event type {event.type} cannot mutate a canvas graph")

    next_graph.version += 1
    return next_graph


def apply_events(graph: CanvasGraph, events: Iterable[CanvasEvent]) -> CanvasGraph:
    next_graph = graph
    for event in events:
        next_graph = apply_canvas_event(next_graph, event)
    return next_graph


def apply_commit_patch(state: SessionState, patch: CommitPatch) -> list[CanvasEvent]:
    emitted: list[CanvasEvent] = []

    for operation in patch.operations:
        path = operation.path
        if path == "/master_graph/nodes/-" and operation.op == "add":
            event = CanvasEvent(
                sessionId=state.id,
                layer="master",
                targetCanvas="master",
                type="node.add",
                payload=operation.value,
            )
            state.master_graph = apply_canvas_event(state.master_graph, event)
            emitted.append(event)
        elif path == "/master_graph/edges/-" and operation.op == "add":
            event = CanvasEvent(
                sessionId=state.id,
                layer="master",
                targetCanvas="master",
                type="edge.add",
                payload=operation.value,
            )
            state.master_graph = apply_canvas_event(state.master_graph, event)
            emitted.append(event)
        elif path == "/prd_draft/decisions/-" and operation.op == "add":
            decisions = deepcopy(state.prd_draft.setdefault("decisions", []))
            decisions.append(operation.value)
            state.prd_draft["decisions"] = decisions
        else:
            raise ValueError(f"unsupported commit operation: {operation.op} {path}")

    emitted.append(
        CanvasEvent(
            sessionId=state.id,
            layer="consolidator",
            targetCanvas="master",
            type="commit.patch",
            payload=patch.model_dump(mode="json"),
        )
    )
    return emitted
