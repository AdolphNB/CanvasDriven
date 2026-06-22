from __future__ import annotations

import hashlib
import hmac
import os
import time
import threading
from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

import httpx
from pydantic import BaseModel, Field


XUNHU_APP_ID = os.environ.get("XUNHU_APP_ID", "20211120103")
XUNHU_APP_SECRET = os.environ.get("XUNHU_APP_SECRET", "29b02cdb43555a21e75706551beae8fa")
XUNHU_NOTIFY_URL = os.environ.get("NOTIFY_URL", "https://canvasdriven.singularitynear.com/payment/notify")
XUNHU_API_URL = "https://api.dpweixin.com/payment/do.html"

ORDER_EXPIRY_SECONDS = 300


class PaymentOrder(BaseModel):
    orderId: str = Field(default_factory=lambda: str(uuid4()))
    sessionId: str
    amount: int
    goodsName: str
    format: Literal["png", "pdf"] = "png"
    watermark: bool = True
    status: Literal["pending", "paid", "expired"] = "pending"
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    wechatUrl: str | None = None


class OrderStore:
    def __init__(self) -> None:
        self._orders: dict[str, PaymentOrder] = {}
        self._lock = threading.RLock()

    def add(self, order: PaymentOrder) -> None:
        with self._lock:
            self._orders[order.orderId] = order

    def get(self, order_id: str) -> PaymentOrder | None:
        with self._lock:
            order = self._orders.get(order_id)
            if order is None:
                return None
            if order.status == "pending":
                elapsed = (datetime.now(timezone.utc) - order.createdAt).total_seconds()
                if elapsed > ORDER_EXPIRY_SECONDS:
                    order.status = "expired"
            return order

    def mark_paid(self, order_id: str) -> bool:
        with self._lock:
            order = self._orders.get(order_id)
            if order is None or order.status != "pending":
                return False
            order.status = "paid"
            return True


order_store = OrderStore()


def _xunhu_sign(params: dict[str, str]) -> str:
    sorted_items = sorted(params.items())
    query = "&".join(f"{k}={v}" for k, v in sorted_items if v != "")
    return hashlib.md5((query + XUNHU_APP_SECRET).encode()).hexdigest()


def _is_mock_mode() -> bool:
    return not XUNHU_APP_ID or not XUNHU_APP_SECRET


async def create_payment(
    session_id: str,
    amount: int,
    goods_name: str,
    fmt: str,
    watermark: bool,
) -> PaymentOrder:
    order = PaymentOrder(
        sessionId=session_id,
        amount=amount,
        goodsName=goods_name,
        format=fmt,
        watermark=watermark,
    )

    if _is_mock_mode():
        order.wechatUrl = "https://pay.example.com/mock/wechat"
        order_store.add(order)
        return order

    wechat_params: dict[str, str] = {
        "version": "1.1",
        "appid": XUNHU_APP_ID,
        "trade_order_id": order.orderId,
        "total_fee": str(amount),
        "title": goods_name,
        "time": str(int(time.time())),
        "notify_url": XUNHU_NOTIFY_URL,
        "type": "WAP",
        "wap_url": XUNHU_NOTIFY_URL,
        "wap_name": "CanvasDriven",
    }
    wechat_params["hash"] = _xunhu_sign(wechat_params)

    async with httpx.AsyncClient(timeout=15) as client:
        wechat_resp = await client.post(XUNHU_API_URL, data=wechat_params)
        wechat_data = wechat_resp.json()
        if wechat_data.get("errcode") == 0:
            order.wechatUrl = wechat_data.get("url_qrcode") or wechat_data.get("url")

    order_store.add(order)
    return order


def verify_notify(params: dict[str, str]) -> bool:
    received_hash = params.pop("hash", "")
    if not received_hash:
        return False
    expected_hash = _xunhu_sign(params)
    return hmac.compare_digest(expected_hash, received_hash)
