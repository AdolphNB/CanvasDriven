# CanvasDriven Demo-First Redesign

## Goal

Rebuild CanvasDriven around an architect-led requirements discussion loop: the user chats about requirements, the backend calls a configured real LLM API, the agent responds as an experienced software architect, and the latest architecture is rendered as Mermaid on the frontend.

## Scope

This pass prioritizes a real working LLM-to-Mermaid loop over the previous React Flow node demo. The backend keeps WebSocket transport and session state, adds LLM configuration, and uses the OpenAI Responses API or an OpenAI-compatible `/responses` endpoint. The frontend becomes a compact Command Bar interface with LLM configuration, architect chat, and live Mermaid preview.

## Backend Design

The backend keeps FastAPI, uv, Pydantic models, and WebSocket JSON events. `SessionState` stores `messages`, `llm_config`, `current_mermaid`, and `architecture_summary`. `CanvasService.discuss()` records the user message, calls the LLM, records the assistant response, updates Mermaid, and emits `chat.message` plus `architect.response`.

The LLM prompt instructs the model to behave as a senior software architect and return strict JSON with `assistantMessage`, `mermaidCode`, and `architectureSummary`. The default provider is OpenAI with model `gpt-5.2`; an OpenAI-compatible provider can be configured with a custom base URL.

## Frontend Design

The app changes from a left sidebar to a Command Bar layout:

- Top bar: product identity, connection state, provider/model/API key configuration, and Apply action.
- Main work area: architect chat and Mermaid preview side by side on desktop, stacked on smaller screens.
- Bottom prompt: single-line requirements input with a send action.
- Status strip: current architecture summary and compact event stream.

The visual style should be light, restrained, and demo-friendly. The chat panel should read like an architecture review workspace, and the Mermaid panel should feel like a live diagram surface.

## Testing

Backend tests cover existing graph behavior and LLM response parsing. Frontend tests cover graph reducer behavior and the new architect chat shell. Verification must include backend pytest, frontend Vitest, frontend build, and browser inspection of the running UI.

## Constraints

- Keep the existing stack: Python/FastAPI/uv backend and React/Vite/React Flow frontend.
- Do not introduce real ASR in this pass.
- Real LLM calls are supported through the backend only; browser-entered keys are sent to local backend session memory and are not persisted.
- No git commit is possible because the workspace is not a git repository.
