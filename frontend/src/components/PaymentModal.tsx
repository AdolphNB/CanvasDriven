import { Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { PaymentOrder } from "../paymentTypes";

type PaymentTab = "wechat" | "alipay";

type PaymentModalProps = {
  order: PaymentOrder;
  onSuccess: () => void;
  onTimeout: () => void;
  onClose: () => void;
};

const POLL_INTERVAL = 2000;
const MAX_POLLS = 150;

export function PaymentModal({ order, onSuccess, onTimeout, onClose }: PaymentModalProps) {
  const [tab, setTab] = useState<PaymentTab>("wechat");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [status, setStatus] = useState<"pending" | "success" | "timeout">("pending");
  const pollCount = useRef(0);

  const qrUrl = tab === "wechat" ? order.wechatUrl : order.alipayUrl;

  useEffect(() => {
    if (!qrUrl) return;
    QRCode.toDataURL(qrUrl, { width: 256, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [qrUrl]);

  useEffect(() => {
    if (status !== "pending") return;

    const timer = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current >= MAX_POLLS) {
        setStatus("timeout");
        return;
      }

      try {
        const resp = await fetch(`http://127.0.0.1:8000/payment/status/${order.orderId}`);
        const data = await resp.json();
        if (data.status === "paid") {
          setStatus("success");
          setTimeout(onSuccess, 1200);
        }
      } catch {
        // continue polling on network error
      }
    }, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, [status, order.orderId, onSuccess]);

  function getAmountYuan(): string {
    return (order.amount / 100).toFixed(0);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>扫码支付 ¥{getAmountYuan()}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="payment-tabs">
          <button
            type="button"
            className={`payment-tab${tab === "wechat" ? " active" : ""}`}
            onClick={() => setTab("wechat")}
          >
            微信支付
          </button>
          <button
            type="button"
            className={`payment-tab${tab === "alipay" ? " active" : ""}`}
            onClick={() => setTab("alipay")}
          >
            支付宝
          </button>
        </div>

        <div className="qr-area">
          {status === "pending" && (
            <>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt={`${tab} QR code`} className="qr-image" />
              ) : (
                <div className="qr-placeholder">
                  {qrUrl ? "二维码加载中..." : `${tab === "wechat" ? "微信" : "支付宝"}通道暂不可用`}
                </div>
              )}
              <div className="payment-status">
                <Loader2 size={16} className="spin" />
                等待支付确认...
              </div>
              <button
                type="button"
                className="mock-pay-btn"
                onClick={async () => {
                  try {
                    await fetch(`http://127.0.0.1:8000/payment/mock-pay/${order.orderId}`, { method: "POST" });
                  } catch { /* polling will pick it up */ }
                }}
              >
                模拟支付（本地测试）
              </button>
            </>
          )}
          {status === "success" && (
            <div className="payment-success">支付成功！</div>
          )}
          {status === "timeout" && (
            <div className="payment-timeout">
              <p>支付超时，请重试</p>
              <button type="button" className="retry-btn" onClick={onTimeout}>
                返回重新选择
              </button>
            </div>
          )}
        </div>

        <p className="payment-hint">支付完成后将自动开始下载</p>
      </div>
    </div>
  );
}
