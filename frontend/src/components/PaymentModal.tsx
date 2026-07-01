import { Loader2, X, FlaskConical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { PaymentOrder } from "../paymentTypes";

type PaymentModalProps = {
  order: PaymentOrder;
  onSuccess: () => void;
  onTimeout: () => void;
  onClose: () => void;
};

const POLL_INTERVAL = 2000;
const MAX_POLLS = 150;
const MOCK_WECHAT_URL = "https://pay.example.com/mock/wechat";

export function PaymentModal({ order, onSuccess, onTimeout, onClose }: PaymentModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [status, setStatus] = useState<"pending" | "success" | "downloading" | "timeout">("pending");
  const pollCountRef = useRef(0);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!order.wechatUrl) return;
    QRCode.toDataURL(order.wechatUrl, { width: 256, margin: 2 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [order.wechatUrl]);

  useEffect(() => {
    if (status !== "pending") return;

    const timer = setInterval(async () => {
      pollCountRef.current += 1;
      setPollCount(pollCountRef.current);
      if (pollCountRef.current >= MAX_POLLS) {
        setStatus("timeout");
        return;
      }

      try {
        const resp = await fetch(`/payment/status/${order.orderId}`);
        const data = await resp.json();
        console.log(`[Payment] poll #${pollCountRef.current}: status=${data.status}`);
        if (data.status === "paid") {
          setStatus("success");
          setTimeout(() => {
            setStatus("downloading");
            onSuccess();
          }, 1200);
        }
      } catch {
        // continue polling on network error
      }
    }, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, [status, order.orderId, onSuccess]);

  async function handleMockPay() {
    try {
      const resp = await fetch(`/payment/mock-pay/${order.orderId}`, { method: "POST" });
      if (!resp.ok) return;
      setStatus("downloading");
      onSuccess();
    } catch { }
  }

  function getAmountYuan(): string {
    return `¥${order.amount}`;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>微信支付 ¥{getAmountYuan()}</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="qr-area">
          {status === "pending" && (
            <>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="微信支付二维码" className="qr-image" />
              ) : (
                <div className="qr-placeholder">
                  {order.wechatUrl ? "二维码加载中..." : "微信支付通道暂不可用"}
                </div>
              )}
              <div className="payment-status">
                <Loader2 size={16} className="spin" />
                等待支付确认... ({pollCount}/{MAX_POLLS})
              </div>
              {order.wechatUrl === MOCK_WECHAT_URL && (
                <button
                  type="button"
                  className="mock-pay-btn"
                  onClick={handleMockPay}
                >
                  <FlaskConical size={14} />
                  模拟支付完成
                </button>
              )}
            </>
          )}
          {status === "success" && (
            <div className="payment-success">支付成功！</div>
          )}
          {status === "downloading" && (
            <div className="payment-downloading">
              <Loader2 size={16} className="spin" />
              正在下载...
            </div>
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
