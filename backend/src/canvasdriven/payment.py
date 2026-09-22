from __future__ import annotations

import hashlib
import hmac
import logging
import os
import random
import sqlite3
import string
import threading
import time
from collections.abc import Mapping
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from uuid import uuid4

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

XUNHU_API_URL = "https://api.dpweixin.com/payment/do.html"

ORDER_EXPIRY_SECONDS = 300

# ---- 服务端档位白名单 -------------------------------------------------------
# 取值来源：线上前端 bundle 的档位定义（2026-09-22 实测 index-*.js）：
#   {id:"token", amount:1, watermark:false, goodsName:"架构图下载-1元token费"}
#   {id:"candy", amount:2, watermark:false, goodsName:"架构图下载-2元请老板吃颗糖"}
#   {id:"drink", amount:5, watermark:false, goodsName:"架构图下载-5元赏蜜雪冰橙一杯"}
# 免费档不走 /payment/create，故不入白名单。
PAID_TIERS: dict[int, str] = {
    1: "架构图下载-1元token费",
    2: "架构图下载-2元请老板吃颗糖",
    5: "架构图下载-5元赏蜜雪冰橙一杯",
}

ALLOWED_FORMATS: tuple[str, ...] = ("png", "pdf")

DEFAULT_DB_FILENAME = "orders.db"


class InvalidOrder(ValueError):
    """档位 / 商品名 / 格式不在服务端白名单内（调用方应回 4xx，不要建单）。"""


def _env(name: str) -> str:
    return os.environ.get(name, "")


def default_order_db_path() -> Path:
    """订单库路径：ORDER_DB_PATH 优先，否则 backend/data/orders.db。

    SQLite 文件必须放在持久卷上（容器/多 worker 都读同一份），否则会出现
    「付款后查不到订单」。只读环境无法建库时调用方会拿到 sqlite3.OperationalError。
    """
    override = _env("ORDER_DB_PATH")
    if override:
        return Path(override)
    return Path(__file__).resolve().parents[2] / "data" / DEFAULT_DB_FILENAME


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


def validate_tier(amount: int, goods_name: str, fmt: str) -> None:
    """校验客户端传来的档位，非法即抛 InvalidOrder（不建单、不打支付网关）。"""
    if amount not in PAID_TIERS:
        raise InvalidOrder(f"amount={amount} 不在允许档位 {sorted(PAID_TIERS)}")
    expected_goods = PAID_TIERS[amount]
    if goods_name != expected_goods:
        raise InvalidOrder(
            f"goodsName 与档位不匹配：amount={amount} 应为 {expected_goods!r}，收到 {goods_name!r}"
        )
    if fmt not in ALLOWED_FORMATS:
        raise InvalidOrder(f"format={fmt!r} 不在允许值 {list(ALLOWED_FORMATS)}")


_SCHEMA = """
CREATE TABLE IF NOT EXISTS orders (
    order_id   TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    amount     INTEGER NOT NULL,
    goods_name TEXT NOT NULL,
    format     TEXT NOT NULL,
    watermark  INTEGER NOT NULL,
    status     TEXT NOT NULL,
    created_at TEXT NOT NULL,
    wechat_url TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
"""


def _row_to_order(row: sqlite3.Row) -> PaymentOrder:
    return PaymentOrder(
        orderId=row["order_id"],
        sessionId=row["session_id"],
        amount=row["amount"],
        goodsName=row["goods_name"],
        format=row["format"],
        watermark=bool(row["watermark"]),
        status=row["status"],
        createdAt=datetime.fromisoformat(row["created_at"]),
        wechatUrl=row["wechat_url"],
    )


class OrderStore:
    """SQLite 持久化订单库：多 worker / 重启后仍可查单（取代进程内 dict）。

    每次操作开一条短连接（WAL + busy_timeout），因此不同进程、不同线程
    看到的是同一份数据；写入用条件的 UPDATE 保证「置 paid」幂等。
    """

    def __init__(self, db_path: str | Path | None = None) -> None:
        self.db_path = Path(db_path) if db_path is not None else default_order_db_path()
        self._lock = threading.RLock()

    def _connect(self) -> sqlite3.Connection:
        parent = self.db_path.parent
        if str(parent):
            parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=5.0, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.executescript(_SCHEMA)
        return conn

    def add(self, order: PaymentOrder) -> None:
        with self._lock, closing(self._connect()) as conn:
            conn.execute(
                """
                INSERT INTO orders (order_id, session_id, amount, goods_name, format,
                                    watermark, status, created_at, wechat_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(order_id) DO UPDATE SET
                    status=excluded.status,
                    wechat_url=excluded.wechat_url
                """,
                (
                    order.orderId,
                    order.sessionId,
                    order.amount,
                    order.goodsName,
                    order.format,
                    int(order.watermark),
                    order.status,
                    order.createdAt.isoformat(),
                    order.wechatUrl,
                ),
            )

    def get(self, order_id: str) -> PaymentOrder | None:
        with self._lock, closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM orders WHERE order_id = ?", (order_id,)).fetchone()
            if row is None:
                return None
            order = _row_to_order(row)
            if order.status == "pending":
                elapsed = (datetime.now(timezone.utc) - order.createdAt).total_seconds()
                if elapsed > ORDER_EXPIRY_SECONDS:
                    conn.execute(
                        "UPDATE orders SET status='expired' WHERE order_id = ? AND status='pending'",
                        (order_id,),
                    )
                    order.status = "expired"
            return order

    def mark_paid(self, order_id: str) -> bool:
        """仅 pending → paid 成功一次；重复回调（幂等）返回 False。"""
        with self._lock, closing(self._connect()) as conn:
            cursor = conn.execute(
                "UPDATE orders SET status='paid' WHERE order_id = ? AND status='pending'",
                (order_id,),
            )
            return cursor.rowcount == 1


order_store = OrderStore()


def _xunhu_sign(params: Mapping[str, str], secret: str | None = None) -> str:
    key = _env("XUNHU_APP_SECRET") if secret is None else secret
    sorted_items = sorted((str(k), str(v)) for k, v in params.items() if str(v) != "")
    query = "&".join(f"{k}={v}" for k, v in sorted_items)
    return hashlib.md5((query + key).encode()).hexdigest()


def _is_mock_mode() -> bool:
    return not _env("XUNHU_APP_ID") or not _env("XUNHU_APP_SECRET")


def _generate_nonce_str(length: int = 16) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=length))


async def create_payment(
    session_id: str,
    amount: int,
    goods_name: str,
    fmt: str,
    watermark: bool,
) -> PaymentOrder:
    validate_tier(amount, goods_name, fmt)

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
        "appid": _env("XUNHU_APP_ID"),
        "trade_order_id": order.orderId,
        "total_fee": str(amount),
        "title": goods_name,
        "time": str(int(time.time())),
        "notify_url": _env("NOTIFY_URL")
        or "https://canvasdriven.singularitynear.com/payment/notify",
        "nonce_str": _generate_nonce_str(),
        "type": "NATIVE",
    }
    wechat_params["hash"] = _xunhu_sign(wechat_params)

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            wechat_resp = await client.post(XUNHU_API_URL, data=wechat_params)
            wechat_data = wechat_resp.json()
            if wechat_data.get("errcode") == 0:
                order.wechatUrl = wechat_data.get("url") or wechat_data.get("url_qrcode")
            else:
                logger.error(
                    "Xunhu API error: errcode=%s errmsg=%s order=%s",
                    wechat_data.get("errcode"),
                    wechat_data.get("errmsg"),
                    order.orderId,
                )
        except Exception:
            logger.exception("Xunhu API call failed for order %s", order.orderId)

    order_store.add(order)
    return order


def verify_notify(params: Mapping[str, str]) -> bool:
    """校验支付回调签名。不改动入参；未配置密钥（mock/未部署）时一律判不合法。"""
    secret = _env("XUNHU_APP_SECRET")
    if not secret:
        return False
    received_hash = str(params.get("hash") or "")
    if not received_hash:
        return False
    if not str(params.get("trade_order_id") or ""):
        return False
    payload = {str(k): str(v) for k, v in params.items() if k != "hash"}
    expected_hash = _xunhu_sign(payload, secret)
    return hmac.compare_digest(expected_hash, received_hash)
