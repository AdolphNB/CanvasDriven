#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_LOG="$ROOT_DIR/backend-dev.log"
FRONTEND_LOG="$ROOT_DIR/frontend-dev.log"
BACKEND_PORT=8000
FRONTEND_PORT=5174

LLM_CONFIG="$ROOT_DIR/config/llm.local.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[CanvasDriven]${NC} $*"; }
warn() { echo -e "${YELLOW}[CanvasDriven]${NC} $*"; }
err()  { echo -e "${RED}[CanvasDriven]${NC} $*" >&2; }

cleanup() {
    if [ -n "${BACKEND_PID:-}" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "${FRONTEND_PID:-}" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    log "Stopped."
}
trap cleanup EXIT INT TERM

kill_port() {
    local port=$1
    local pid
    pid="$(lsof -ti :"$port" 2>/dev/null || true)"
    if [ -n "$pid" ]; then
        warn "Killing process $pid on port $port..."
        kill "$pid" 2>/dev/null || true
        sleep 0.5
    fi
}

wait_http() {
    local name=$1 url=$2 timeout=${3:-20}
    local elapsed=0
    while [ "$elapsed" -lt "$timeout" ]; do
        if curl -sf -o /dev/null "$url" 2>/dev/null; then
            log "$name ready: $url"
            return 0
        fi
        sleep 0.5
        elapsed=$((elapsed + 1))
    done
    err "$name did not become ready in ${timeout}s: $url"
    return 1
}

# --- Parse args ---
RESTART=false
OPEN_BROWSER=false
for arg in "$@"; do
    case "$arg" in
        -r|--restart) RESTART=true ;;
        -o|--open)    OPEN_BROWSER=true ;;
        -h|--help)
            echo "Usage: $0 [--restart] [--open] [--help]"
            echo "  --restart  Kill existing processes on configured ports first"
            echo "  --open     Open browser after startup"
            echo "  --help     Show this help"
            exit 0
            ;;
        *) err "Unknown argument: $arg"; exit 1 ;;
    esac
done

# --- Check LLM config ---
if [ ! -f "$LLM_CONFIG" ]; then
    warn "LLM config not found at $LLM_CONFIG"
    warn "Creating from template. Edit it with your API key before running."
    cp "$ROOT_DIR/config/llm.local.example.json" "$LLM_CONFIG"
fi

# --- Kill stale processes ---
if [ "$RESTART" = true ]; then
    kill_port "$BACKEND_PORT"
    kill_port "$FRONTEND_PORT"
fi

# --- Check payment env ---
if [ -z "${XUNHU_APP_ID:-}" ] || [ -z "${XUNHU_APP_SECRET:-}" ]; then
    warn "XUNHU_APP_ID / XUNHU_APP_SECRET not set — payment will run in MOCK mode."
else
    log "Xunhu payment configured with APP_ID=${XUNHU_APP_ID}"
fi

# --- Start backend ---
if lsof -ti :"$BACKEND_PORT" >/dev/null 2>&1; then
    log "Backend already running on port $BACKEND_PORT"
else
    log "Starting backend..."
    : > "$BACKEND_LOG"
    (cd "$BACKEND_DIR" && uv run uvicorn canvasdriven.main:app --host 127.0.0.1 --port "$BACKEND_PORT" > "$BACKEND_LOG" 2>&1) &
    BACKEND_PID=$!
fi

# --- Start frontend ---
if lsof -ti :"$FRONTEND_PORT" >/dev/null 2>&1; then
    log "Frontend already running on port $FRONTEND_PORT"
else
    log "Installing frontend dependencies..."
    (cd "$FRONTEND_DIR" && npm install --silent 2>/dev/null)
    log "Starting frontend..."
    : > "$FRONTEND_LOG"
    (cd "$FRONTEND_DIR" && npx vite --host 127.0.0.1 --port "$FRONTEND_PORT" --strictPort > "$FRONTEND_LOG" 2>&1) &
    FRONTEND_PID=$!
fi

# --- Wait for ready ---
wait_http "Backend"  "http://127.0.0.1:$BACKEND_PORT/health" 20 || true
wait_http "Frontend" "http://127.0.0.1:$FRONTEND_PORT"       30 || true

echo ""
log "CanvasDriven is running:"
log "  Frontend: http://127.0.0.1:$FRONTEND_PORT"
log "  Backend:  http://127.0.0.1:$BACKEND_PORT"
log "  Logs:     backend-dev.log, frontend-dev.log"
echo ""

if [ "$OPEN_BROWSER" = true ]; then
    xdg-open "http://127.0.0.1:$FRONTEND_PORT" 2>/dev/null || true
fi

log "Press Ctrl+C to stop."
wait
