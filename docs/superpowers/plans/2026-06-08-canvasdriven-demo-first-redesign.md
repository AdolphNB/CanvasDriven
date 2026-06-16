# CanvasDriven Demo-First Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild CanvasDriven as a polished demo-first dual-canvas architecture workspace.

**Architecture:** Keep FastAPI WebSocket events and React Flow rendering, but simplify the demo surface. Backend service remains the single state mutation boundary; frontend uses a Command Bar layout with large Master and Draft canvases.

**Tech Stack:** Python, FastAPI, Pydantic, uv, React, TypeScript, Vite, React Flow, Zustand, Vitest.

---

## File Structure

- Modify `backend/src/canvasdriven/agents.py`: improve mock sandbox chunking and demo node labels.
- Modify `backend/src/canvasdriven/service.py`: make fork display the master-derived branch graph and keep branch merge/reset behavior coherent.
- Modify `backend/tests/test_service.py`: add/adjust tests for demo branch semantics and text chunking.
- Modify `frontend/src/App.tsx`: replace sidebar layout with Command Bar, dual-canvas workspace, compact event strip, bottom prompt.
- Modify `frontend/src/CanvasPane.tsx`: refine React Flow node/edge styling for demo polish.
- Modify `frontend/src/styles.css`: replace sidebar CSS with responsive Command Bar layout and simplified visual system.
- Modify `frontend/src/graphReducer.test.ts`: keep reducer coverage stable after frontend changes.

---

### Task 1: Backend Demo Branch Semantics

**Files:**
- Modify: `backend/src/canvasdriven/service.py`
- Test: `backend/tests/test_service.py`

- [ ] **Step 1: Write the failing test**

Add this test to `backend/tests/test_service.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/test_service.py::test_fork_shows_master_snapshot_as_active_draft -v`

Expected: FAIL because `fork()` currently emits the active draft graph, not the master-derived branch graph.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/canvasdriven/service.py`, change `fork()` so the event payload uses the copied branch graph:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/test_service.py::test_fork_shows_master_snapshot_as_active_draft -v`

Expected: PASS.

---

### Task 2: Backend Demo Text Events

**Files:**
- Modify: `backend/src/canvasdriven/agents.py`
- Test: `backend/tests/test_service.py`

- [ ] **Step 1: Write the failing test**

Add this test to `backend/tests/test_service.py`:

```python
def test_submit_text_creates_compact_demo_events() -> None:
    state = SessionState(id="s1")

    events = canvas_service.submit_text(state, "API gateway, auth service, risk: latency")

    node_events = [event for event in events if event.type == "node.add"]
    edge_events = [event for event in events if event.type == "edge.add"]
    assert [event.payload["label"] for event in node_events] == ["API gateway", "auth service", "risk: latency"]
    assert node_events[1].payload["kind"] == "module"
    assert node_events[2].payload["kind"] == "risk"
    assert len(edge_events) == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend; uv run pytest tests/test_service.py::test_submit_text_creates_compact_demo_events -v`

Expected: FAIL if chunking or classification does not produce the desired compact demo labels.

- [ ] **Step 3: Write minimal implementation**

Update `split_mock_asr_chunks()` in `backend/src/canvasdriven/agents.py` so comma-separated phrases are preserved and whitespace-only splitting is avoided for normal prose:

```python
def split_mock_asr_chunks(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text.strip())
    if not normalized:
        return []
    chunks = re.split(r"\s*(?:,|;|\n|，|；|。)\s*", normalized)
    return [chunk.strip(" .!?！？") for chunk in chunks if chunk.strip(" .!?！？")]
```

Keep `classify_node_kind()` keyword logic so `service` and `agent` still classify modules and risks.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend; uv run pytest tests/test_service.py::test_submit_text_creates_compact_demo_events -v`

Expected: PASS.

---

### Task 3: Command Bar Frontend Layout

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Write the failing UI test**

If adding a render test is practical, create `frontend/src/App.test.tsx` with:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the command bar demo shell', () => {
    render(<App />);

    expect(screen.getByText('CanvasDriven')).toBeInTheDocument();
    expect(screen.getByText('Master Canvas')).toBeInTheDocument();
    expect(screen.getByText('Draft Canvas')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Speak or type an architecture idea')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend; npm test -- --run src/App.test.tsx`

Expected: FAIL before the placeholder and new shell exist.

- [ ] **Step 3: Implement Command Bar layout**

Replace the sidebar structure in `frontend/src/App.tsx` with top command bar, central canvases, compact events, and bottom prompt. Preserve existing `sendCommand()` calls and state hooks.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend; npm test -- --run src/App.test.tsx`

Expected: PASS.

---

### Task 4: Canvas Visual Polish

**Files:**
- Modify: `frontend/src/CanvasPane.tsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Preserve reducer tests**

Run: `cd frontend; npm test -- --run src/graphReducer.test.ts`

Expected: PASS before styling changes.

- [ ] **Step 2: Implement polished canvas nodes**

Update `CanvasPane.tsx` node styles to use compact width, type-specific border accents, stable text sizing, softer shadows, and lighter minimap/background styling.

- [ ] **Step 3: Implement responsive CSS**

Update `styles.css` so desktop uses top bar, two-column canvas grid, event strip, and bottom prompt. Add mobile rules to stack canvases and keep buttons wrapping cleanly.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend; npm test -- --run`

Expected: PASS.

---

### Task 5: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run backend tests**

Run: `cd backend; uv run pytest`

Expected: all backend tests pass.

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend; npm test -- --run`

Expected: all frontend tests pass.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend; npm run build`

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Browser verify**

Run backend and frontend dev servers. Open the frontend in the browser. Submit a prompt, commit it, fork a branch, add branch text, and merge it. Verify the UI remains nonblank, readable, and the Master/Draft canvases update as expected.

---

## Self-Review

- Spec coverage: backend mock demo flow, Command Bar UI, branch semantics, testing, and browser verification are all covered.
- Placeholder scan: no task relies on TBD or unspecified behavior.
- Type consistency: paths and command names match current codebase.
