# CanvasDriven

Voice-ready, canvas-driven architecture workspace MVP.

## Stack

- Backend: Python, FastAPI, LangGraph state definitions, Pydantic, uv
- Frontend: React, TypeScript, Vite, React Flow, Zustand

## Run Backend

```powershell
cd backend
uv sync
uv run uvicorn canvasdriven.main:app --reload --host 127.0.0.1 --port 8000
```

## Run Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5174`.

## Start Both

```powershell
.\start.ps1
```

If a stale process is holding a port:

```powershell
.\start.ps1 -Restart
```

To open the browser after startup:

```powershell
.\start.ps1 -OpenBrowser
```

## LLM Config

Edit `config/llm.local.json` once and restart the backend:

```json
{
  "provider": "openai_compatible",
  "apiMode": "chat_completions",
  "model": "deepseek-chat",
  "baseUrl": "https://api.deepseek.com",
  "apiKey": "your-api-key"
}
```

`config/llm.local.json` is ignored by git. Keep `config/llm.local.example.json` as the shareable template.

## Tests

```powershell
cd backend
uv run pytest

cd ..\frontend
npm test -- --run
```
