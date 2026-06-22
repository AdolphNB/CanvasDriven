from __future__ import annotations

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .llm import chunk_text_for_stream
from .models import CanvasEvent, ClientCommand
from .payment import _is_mock_mode, create_payment, order_store, verify_notify
from .service import canvas_service
from .state import SessionState, store


app = FastAPI(title="CanvasDriven API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://canvasdriven.singularitynear.com",
        "http://canvasdriven.singularitynear.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SessionSnapshot(BaseModel):
    sessionId: str
    draftGraph: object
    masterGraph: object
    branchGraphs: object
    activeBranch: str | None
    prdDraft: object
    messages: object
    llmConfig: object
    currentMermaid: str
    architectureSummary: str


class TextRequest(BaseModel):
    text: str


class BranchRequest(BaseModel):
    branchName: str


class PaymentCreateRequest(BaseModel):
    sessionId: str
    amount: int
    goodsName: str
    format: str = "png"
    watermark: bool = False


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/payment/create")
async def payment_create(request: PaymentCreateRequest) -> dict:
    order = await create_payment(
        session_id=request.sessionId,
        amount=request.amount,
        goods_name=request.goodsName,
        fmt=request.format,
        watermark=request.watermark,
    )
    return order.model_dump(mode="json")


@app.get("/payment/status/{order_id}")
def payment_status(order_id: str) -> dict:
    order = order_store.get(order_id)
    if order is None:
        raise HTTPException(status_code=404, detail="order not found")
    return {"orderId": order.orderId, "status": order.status, "format": order.format, "watermark": order.watermark}


@app.post("/payment/notify")
async def payment_notify(request: Request) -> str:
    form_data = dict(await request.form())
    if verify_notify(form_data):
        order_id = form_data.get("trade_order_id", "")
        order_store.mark_paid(order_id)
    return "success"


@app.post("/payment/mock-pay/{order_id}")
def mock_pay(order_id: str) -> dict:
    if not _is_mock_mode():
        raise HTTPException(status_code=403, detail="mock pay only available in dev mode")
    success = order_store.mark_paid(order_id)
    if not success:
        raise HTTPException(status_code=404, detail="order not found or already paid")
    return {"orderId": order_id, "status": "paid"}


@app.post("/sessions")
def create_session() -> SessionSnapshot:
    return snapshot(store.create())


@app.get("/sessions/{session_id}")
def get_session(session_id: str) -> SessionSnapshot:
    try:
        return snapshot(store.get(session_id))
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="session not found") from exc


@app.post("/sessions/{session_id}/text")
def submit_text(session_id: str, request: TextRequest) -> list[object]:
    state = store.get_or_create(session_id)
    return [event.model_dump(mode="json") for event in canvas_service.submit_text(state, request.text)]


@app.post("/sessions/{session_id}/commit")
def commit(session_id: str) -> list[object]:
    state = store.get_or_create(session_id)
    return [event.model_dump(mode="json") for event in canvas_service.commit(state)]


@app.post("/sessions/{session_id}/reset")
def reset(session_id: str) -> list[object]:
    state = store.get_or_create(session_id)
    return [event.model_dump(mode="json") for event in canvas_service.reset_draft(state)]


@app.post("/sessions/{session_id}/branches/fork")
def fork(session_id: str, request: BranchRequest) -> list[object]:
    state = store.get_or_create(session_id)
    return [event.model_dump(mode="json") for event in canvas_service.fork(state, request.branchName)]


@app.post("/sessions/{session_id}/branches/switch")
def switch(session_id: str, request: BranchRequest) -> list[object]:
    state = store.get_or_create(session_id)
    try:
        return [event.model_dump(mode="json") for event in canvas_service.switch(state, request.branchName)]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/sessions/{session_id}/branches/merge")
def merge(session_id: str, request: BranchRequest) -> list[object]:
    state = store.get_or_create(session_id)
    try:
        return [event.model_dump(mode="json") for event in canvas_service.merge(state, request.branchName)]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    state = store.get_or_create(session_id)
    await websocket.send_json({"type": "session.snapshot", "payload": snapshot(state).model_dump(mode="json")})

    try:
        while True:
            command = ClientCommand.model_validate(await websocket.receive_json())
            events = await handle_command(state, command)
            for event in events:
                if event.type == "architect.response":
                    payload = event.payload
                    if isinstance(payload, dict) and isinstance(payload.get("assistantMessage"), str):
                        for chunk in chunk_text_for_stream(payload["assistantMessage"]):
                            delta_event = CanvasEvent(
                                sessionId=state.id,
                                layer="master",
                                targetCanvas="master",
                                type="architect.delta",
                                payload={"content": chunk},
                            )
                            await websocket.send_json(delta_event.model_dump(mode="json"))
                await websocket.send_json(event.model_dump(mode="json"))
    except WebSocketDisconnect:
        return


async def handle_command(state: SessionState, command: ClientCommand):
    match command.type:
        case "text.submit":
            return canvas_service.submit_text(state, command.text or "")
        case "chat.submit":
            try:
                return await canvas_service.discuss(state, command.text or "")
            except Exception as exc:
                user_event = None
                if state.messages and state.messages[-1].role == "user":
                    user_event = CanvasEvent(
                        sessionId=state.id,
                        layer="sandbox",
                        targetCanvas="draft",
                        type="chat.message",
                        payload=state.messages[-1].model_dump(mode="json"),
                    )
                response_event = CanvasEvent(
                    sessionId=state.id,
                    layer="master",
                    targetCanvas="master",
                    type="architect.response",
                    payload={
                        "assistantMessage": f"LLM 调用失败：{exc}",
                        "mermaidCode": state.current_mermaid,
                        "architectureSummary": state.architecture_summary,
                    },
                )
                if user_event is not None:
                    return [user_event, response_event]
                return [
                    response_event
                ]
        case "llm.configure":
            if command.llmConfig is None:
                raise ValueError("llmConfig is required")
            return canvas_service.configure_llm(state, command.llmConfig)
        case "draft.reset":
            return canvas_service.reset_draft(state)
        case "commit":
            return canvas_service.commit(state)
        case "branch.fork":
            return canvas_service.fork(state, command.branchName or "branch")
        case "branch.switch":
            return canvas_service.switch(state, command.branchName or "")
        case "branch.merge":
            return canvas_service.merge(state, command.branchName or "")


def snapshot(state: SessionState) -> SessionSnapshot:
    return SessionSnapshot(
        sessionId=state.id,
        draftGraph=state.active_draft_graph.model_dump(mode="json"),
        masterGraph=state.master_graph.model_dump(mode="json"),
        branchGraphs={name: graph.model_dump(mode="json") for name, graph in state.branch_graphs.items()},
        activeBranch=state.active_branch,
        prdDraft=state.prd_draft,
        messages=[message.model_dump(mode="json") for message in state.messages],
        llmConfig=state.llm_config.model_copy(update={"apiKey": None}).model_dump(mode="json"),
        currentMermaid=state.current_mermaid,
        architectureSummary=state.architecture_summary,
    )
