# Chat Stream Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix chat overflow, add streaming-style assistant output, and align the three-line prompt with the chat panel while the Mermaid panel fills the vertical workspace.

**Architecture:** Backend continues to return complete LLM responses, then emits text chunks over WebSocket as `architect.delta` before the final `architect.response`. Frontend stores an in-progress assistant message, auto-scrolls the chat list, uses a three-line textarea, and sends on Enter while Shift+Enter inserts a newline.

**Tech Stack:** FastAPI WebSocket, Pydantic, React, TypeScript, Zustand, Mermaid, Vitest.

---

### Task 1: Streaming Events

**Files:**
- Modify: `backend/src/canvasdriven/models.py`
- Modify: `backend/src/canvasdriven/main.py`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/store.ts`
- Test: `backend/tests/test_llm.py`

- [ ] Add `architect.delta` event type.
- [ ] Add a small chunking helper test for assistant text.
- [ ] Emit `chat.message`, multiple `architect.delta`, then final `architect.response` from websocket chat handling.
- [ ] Handle delta events in frontend store as a streaming assistant message.

### Task 2: Chat Layout And Input

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/App.test.tsx`

- [ ] Add test expectations for a textarea prompt.
- [ ] Replace prompt input with a 3-row textarea.
- [ ] Send on Enter and preserve newline on Shift+Enter.
- [ ] Move prompt bar into the left chat column so it aligns with chat only.
- [ ] Make `.messages` independently scroll and keep Mermaid panel filling the right side.
- [ ] Auto-scroll the chat list when messages or streaming text changes.

### Task 3: Verification

**Files:**
- No new files.

- [ ] Run `uv run pytest -q`.
- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Browser-check long chat layout and Mermaid panel.
