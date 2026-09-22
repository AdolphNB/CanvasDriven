from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from canvasdriven import main as main_module
from canvasdriven import payment as payment_module
from canvasdriven.payment import (
    PAID_TIERS,
    InvalidOrder,
    OrderStore,
    PaymentOrder,
    create_payment,
    validate_tier,
    verify_notify,
)


def _sign(params: dict[str, str], secret: str) -> str:
    """按虎皮椒约定独立算签名：k=v 按 key 排序、& 连接、忽略空值、末尾拼密钥。"""
    query = "&".join(f"{k}={v}" for k, v in sorted(params.items()) if v != "")
    return hashlib.md5((query + secret).encode()).hexdigest()


def _tier(amount: int) -> dict[str, object]:
    return {
        "sessionId": "session-1",
        "amount": amount,
        "goodsName": PAID_TIERS[amount],
        "format": "png",
        "watermark": False,
    }


@pytest.fixture()
def store(tmp_path, monkeypatch) -> OrderStore:
    db_path = tmp_path / "orders.db"
    monkeypatch.setenv("ORDER_DB_PATH", str(db_path))
    monkeypatch.delenv("XUNHU_APP_ID", raising=False)
    monkeypatch.delenv("XUNHU_APP_SECRET", raising=False)
    fresh = OrderStore(db_path)
    monkeypatch.setattr(payment_module, "order_store", fresh)
    monkeypatch.setattr(main_module, "order_store", fresh)
    return fresh


@pytest.fixture()
def client(store) -> TestClient:
    return TestClient(main_module.app)


# ---- ③ 服务端价格/商品白名单 -------------------------------------------------


@pytest.mark.parametrize("amount", [0, -5, 3, 99999])
def test_create_rejects_amount_outside_whitelist(client: TestClient, amount: int) -> None:
    payload = {"sessionId": "s1", "amount": amount, "goodsName": PAID_TIERS[1], "format": "png", "watermark": False}

    response = client.post("/payment/create", json=payload)

    assert response.status_code == 400, response.text
    assert "amount" in response.json()["detail"]


def test_create_rejects_mismatched_goods_name(client: TestClient) -> None:
    payload = {"sessionId": "s1", "amount": 1, "goodsName": "随便写的名字", "format": "png", "watermark": False}

    response = client.post("/payment/create", json=payload)

    assert response.status_code == 400, response.text
    assert "goodsName" in response.json()["detail"]


def test_create_rejects_unknown_format(client: TestClient) -> None:
    payload = {"sessionId": "s1", "amount": 1, "goodsName": PAID_TIERS[1], "format": "gif", "watermark": False}

    response = client.post("/payment/create", json=payload)

    assert response.status_code == 422, response.text


@pytest.mark.parametrize("amount", sorted(PAID_TIERS))
def test_create_accepts_whitelisted_tiers_and_persists(client: TestClient, store: OrderStore, amount: int) -> None:
    response = client.post("/payment/create", json=_tier(amount))

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["amount"] == amount
    assert body["status"] == "pending"
    assert body["wechatUrl"]

    assert store.get(body["orderId"]) is not None
    status = client.get(f"/payment/status/{body['orderId']}")
    assert status.status_code == 200
    assert status.json()["status"] == "pending"


def test_validate_tier_accepts_catalog_and_rejects_others() -> None:
    for amount, goods_name in PAID_TIERS.items():
        validate_tier(amount, goods_name, "png")
        validate_tier(amount, goods_name, "pdf")

    with pytest.raises(InvalidOrder):
        validate_tier(0, "", "png")
    with pytest.raises(InvalidOrder):
        validate_tier(1, "架构图下载-1元token费", "gif")


async def test_create_payment_validates_before_touching_storage(store: OrderStore) -> None:
    with pytest.raises(InvalidOrder):
        await create_payment(session_id="s1", amount=99999, goods_name="x", fmt="png", watermark=False)


# ---- ① 订单持久化：重启 / 多 worker 仍可查单 ---------------------------------


def test_order_survives_restart_and_paid_is_shared(tmp_path) -> None:
    db_path = tmp_path / "orders.db"
    writer = OrderStore(db_path)
    order = PaymentOrder(sessionId="s1", amount=1, goodsName=PAID_TIERS[1], watermark=False)
    writer.add(order)

    reader = OrderStore(db_path)  # 模拟另一个进程/worker 重新打开同一个库
    assert reader.get(order.orderId) is not None

    assert reader.mark_paid(order.orderId) is True
    assert reader.mark_paid(order.orderId) is False  # 幂等：重复回调不再置 paid
    assert OrderStore(db_path).get(order.orderId).status == "paid"


def test_expiry_transition_is_persisted(tmp_path) -> None:
    db_path = tmp_path / "orders.db"
    stale = PaymentOrder(
        sessionId="s1",
        amount=1,
        goodsName=PAID_TIERS[1],
        watermark=False,
        createdAt=datetime.now(timezone.utc) - timedelta(seconds=600),
    )
    store = OrderStore(db_path)
    store.add(stale)

    assert store.get(stale.orderId).status == "expired"
    assert OrderStore(db_path).get(stale.orderId).status == "expired"


# ---- ② 回调验签与幂等 --------------------------------------------------------


def _notify_params(order_id: str) -> dict[str, str]:
    return {
        "trade_order_id": order_id,
        "total_fee": "1",
        "status": "OD",
        "appid": "20211120103",
        "time": "1789605348",
        "nonce_str": "abcdef123456",
    }


def test_verify_notify_rejects_forgery(monkeypatch) -> None:
    params = _notify_params("order-1")
    monkeypatch.setenv("XUNHU_APP_SECRET", "test-secret")
    signed = {**params, "hash": _sign(params, "test-secret")}

    assert verify_notify(signed) is True
    assert verify_notify({**params, "hash": "0" * 32}) is False
    assert verify_notify({**signed, "hash": ""}) is False
    assert verify_notify(dict(params)) is False
    assert verify_notify(signed | {"total_fee": "99999"}) is False
    assert verify_notify(signed | {"trade_order_id": "order-2"}) is False

    monkeypatch.delenv("XUNHU_APP_SECRET")
    assert verify_notify(signed) is False  # 未配置密钥（mock/未部署）时一律不合法


def test_verify_notify_does_not_mutate_input(monkeypatch) -> None:
    params = _notify_params("order-1")
    monkeypatch.setenv("XUNHU_APP_SECRET", "test-secret")
    payload = {**params, "hash": _sign(params, "test-secret")}

    verify_notify(payload)

    assert payload["hash"] == _sign(params, "test-secret")


def test_notify_endpoint_rejects_forgery_then_is_idempotent(client: TestClient, store: OrderStore, monkeypatch) -> None:
    monkeypatch.setenv("XUNHU_APP_SECRET", "test-secret")
    order = PaymentOrder(sessionId="s1", amount=1, goodsName=PAID_TIERS[1], watermark=False)
    store.add(order)
    params = _notify_params(order.orderId)

    forged = {**params, "hash": "0" * 32}
    assert client.post("/payment/notify", data=forged).status_code == 400
    assert store.get(order.orderId).status == "pending"

    signed = {**params, "hash": _sign(params, "test-secret")}
    response = client.post("/payment/notify", data=signed)
    assert response.status_code == 200, response.text
    assert response.json() == "success"
    assert store.get(order.orderId).status == "paid"

    replay = client.post("/payment/notify", data=signed)
    assert replay.status_code == 200
    assert replay.json() == "success"
    assert store.get(order.orderId).status == "paid"

    ghost = {"trade_order_id": "not-in-db", "total_fee": "1", "time": "1789605348", "nonce_str": "abcdef123456"}
    ghost["hash"] = _sign(ghost, "test-secret")
    assert client.post("/payment/notify", data=ghost).status_code == 404
