from __future__ import annotations

from copy import deepcopy

from .agents import consolidate_to_patch, sandbox_events_for_text
from .llm import generate_architecture_response
from .models import CanvasEvent, CanvasGraph, ChatMessage, LLMConfig
from .reducer import apply_canvas_event, apply_commit_patch
from .state import SessionState


class CanvasService:
    def configure_llm(self, state: SessionState, config: LLMConfig) -> list[CanvasEvent]:
        if config.apiKey is None:
            config = config.model_copy(update={"apiKey": state.llm_config.apiKey})
        state.llm_config = config
        safe_config = config.model_copy(update={"apiKey": None})
        return [
            CanvasEvent(
                sessionId=state.id,
                layer="sandbox",
                targetCanvas="draft",
                type="llm.configured",
                payload=safe_config.model_dump(mode="json"),
            )
        ]

    async def discuss(self, state: SessionState, text: str) -> list[CanvasEvent]:
        user_message = ChatMessage(role="user", content=text)
        state.messages.append(user_message)
        response = await generate_architecture_response(
            config=state.llm_config,
            messages=state.messages,
            current_mermaid=state.current_mermaid,
            architecture_summary=state.architecture_summary,
        )
        assistant_message = ChatMessage(role="assistant", content=response.assistantMessage)
        state.messages.append(assistant_message)
        state.current_mermaid = response.mermaidCode
        state.architecture_summary = response.architectureSummary
        return [
            CanvasEvent(
                sessionId=state.id,
                layer="sandbox",
                targetCanvas="draft",
                type="chat.message",
                payload=user_message.model_dump(mode="json"),
            ),
            CanvasEvent(
                sessionId=state.id,
                layer="master",
                targetCanvas="master",
                type="architect.response",
                payload=response.model_dump(mode="json"),
            ),
        ]

    def submit_text(self, state: SessionState, text: str) -> list[CanvasEvent]:
        events = sandbox_events_for_text(state, text)
        for event in events:
            state.active_draft_graph = apply_canvas_event(state.active_draft_graph, event)
            state.draft_event_log.append(event)
        return events

    def reset_draft(self, state: SessionState) -> list[CanvasEvent]:
        state.active_draft_graph = CanvasGraph()
        state.draft_event_log.clear()
        return [
            CanvasEvent(
                sessionId=state.id,
                layer="sandbox",
                targetCanvas="draft",
                type="draft.reset",
                payload={"activeBranch": state.active_branch},
            )
        ]

    def commit(self, state: SessionState) -> list[CanvasEvent]:
        patch = consolidate_to_patch(state)
        events = apply_commit_patch(state, patch)
        state.draft_graph = CanvasGraph()
        state.active_branch = None
        state.draft_event_log.clear()
        events.append(
            CanvasEvent(
                sessionId=state.id,
                layer="sandbox",
                targetCanvas="draft",
                type="draft.reset",
                payload={"reason": "commit"},
            )
        )
        return events

    def fork(self, state: SessionState, branch_name: str) -> list[CanvasEvent]:
        state.branch_graphs[branch_name] = deepcopy(state.master_graph)
        state.active_branch = branch_name
        event = CanvasEvent(
            sessionId=state.id,
            layer="sandbox",
            targetCanvas="draft",
            type="branch.fork",
            payload={"branchName": branch_name, "graph": state.active_draft_graph.model_dump(mode="json")},
        )
        return [event]

    def switch(self, state: SessionState, branch_name: str) -> list[CanvasEvent]:
        if branch_name not in state.branch_graphs:
            raise ValueError(f"unknown branch: {branch_name}")
        state.active_branch = branch_name
        return [
            CanvasEvent(
                sessionId=state.id,
                layer="sandbox",
                targetCanvas="draft",
                type="branch.switch",
                payload={"branchName": branch_name, "graph": state.active_draft_graph.model_dump(mode="json")},
            )
        ]

    def merge(self, state: SessionState, branch_name: str) -> list[CanvasEvent]:
        if branch_name not in state.branch_graphs:
            raise ValueError(f"unknown branch: {branch_name}")
        state.active_branch = branch_name
        patch = consolidate_to_patch(state, summary_prefix=f"Merged branch {branch_name}")
        events = apply_commit_patch(state, patch)
        state.branch_graphs.clear()
        state.active_branch = None
        state.draft_graph = CanvasGraph()
        state.draft_event_log.clear()
        events.append(
            CanvasEvent(
                sessionId=state.id,
                layer="consolidator",
                targetCanvas="master",
                type="branch.merge",
                payload={"branchName": branch_name},
            )
        )
        events.append(
            CanvasEvent(
                sessionId=state.id,
                layer="sandbox",
                targetCanvas="draft",
                type="draft.reset",
                payload={"reason": "merge"},
            )
        )
        return events


canvas_service = CanvasService()
