from __future__ import annotations

import pytest

from canvasdriven.models import CanvasEvent, CanvasNode, LLMConfig, Position
from canvasdriven.reducer import apply_canvas_event
from canvasdriven.service import canvas_service
from canvasdriven.state import SessionState


def test_canvas_event_schema_accepts_expected_shape() -> None:
    node = CanvasNode(
        id="n1",
        kind="concept",
        label="Realtime canvas",
        data={},
        position=Position(x=0, y=0),
    )
    event = CanvasEvent(
        sessionId="s1",
        layer="sandbox",
        targetCanvas="draft",
        type="node.add",
        payload=node.model_dump(mode="json"),
    )
    assert event.type == "node.add"


def test_draft_reset_does_not_touch_master() -> None:
    state = SessionState(id="s1")
    canvas_service.submit_text(state, "master module")
    canvas_service.commit(state)
    master_version = state.master_graph.version
    master_nodes = len(state.master_graph.nodes)

    canvas_service.submit_text(state, "temporary idea")
    canvas_service.reset_draft(state)

    assert state.draft_graph.nodes == []
    assert state.master_graph.version == master_version
    assert len(state.master_graph.nodes) == master_nodes


def test_commit_moves_clean_patch_to_master_and_clears_draft() -> None:
    state = SessionState(id="s1")
    canvas_service.submit_text(state, "api module, database module")

    events = canvas_service.commit(state)

    assert any(event.type == "commit.patch" for event in events)
    assert len(state.master_graph.nodes) == 2
    assert state.draft_graph.nodes == []
    assert state.prd_draft["decisions"]


def test_fork_switch_merge_keeps_branch_isolated() -> None:
    state = SessionState(id="s1")
    canvas_service.submit_text(state, "baseline module")
    canvas_service.commit(state)
    baseline_nodes = len(state.master_graph.nodes)

    canvas_service.fork(state, "alt-a")
    canvas_service.submit_text(state, "risk queue")
    assert state.active_branch == "alt-a"
    assert len(state.branch_graphs["alt-a"].nodes) > baseline_nodes
    assert len(state.master_graph.nodes) == baseline_nodes

    events = canvas_service.merge(state, "alt-a")

    assert any(event.type == "branch.merge" for event in events)
    assert state.branch_graphs == {}
    assert state.active_branch is None
    assert len(state.master_graph.nodes) > baseline_nodes


def test_invalid_edge_patch_is_rejected() -> None:
    state = SessionState(id="s1")
    event = CanvasEvent(
        sessionId="s1",
        layer="sandbox",
        targetCanvas="draft",
        type="edge.add",
        payload={"id": "e1", "source": "missing-a", "target": "missing-b", "kind": "flow"},
    )
    with pytest.raises(ValueError):
        apply_canvas_event(state.draft_graph, event)


def test_fork_shows_master_snapshot_as_active_draft() -> None:
    state = SessionState(id="s1")
    canvas_service.submit_text(state, "gateway module")
    canvas_service.commit(state)

    events = canvas_service.fork(state, "demo-branch")

    assert state.active_branch == "demo-branch"
    assert len(state.active_draft_graph.nodes) == len(state.master_graph.nodes)
    fork_event = events[0]
    assert fork_event.type == "branch.fork"
    assert len(fork_event.payload["graph"]["nodes"]) == len(state.master_graph.nodes)


def test_submit_text_creates_compact_demo_events() -> None:
    state = SessionState(id="s1")

    events = canvas_service.submit_text(state, "API gateway, auth service, risk: latency")

    node_events = [event for event in events if event.type == "node.add"]
    edge_events = [event for event in events if event.type == "edge.add"]
    assert [event.payload["label"] for event in node_events] == ["API gateway", "auth service", "risk: latency"]
    assert node_events[1].payload["kind"] == "module"
    assert node_events[2].payload["kind"] == "risk"
    assert len(edge_events) == 2


def test_configure_llm_preserves_existing_api_key_when_blank() -> None:
    state = SessionState(
        id="s1",
        llm_config=LLMConfig(
            provider="openai_compatible",
            apiMode="chat_completions",
            model="deepseek-chat",
            baseUrl="https://api.deepseek.com",
            apiKey="saved-key",
        ),
    )

    canvas_service.configure_llm(
        state,
        LLMConfig(
            provider="openai_compatible",
            apiMode="chat_completions",
            model="deepseek-reasoner",
            baseUrl="https://api.deepseek.com",
            apiKey=None,
        ),
    )

    assert state.llm_config.model == "deepseek-reasoner"
    assert state.llm_config.apiKey == "saved-key"
