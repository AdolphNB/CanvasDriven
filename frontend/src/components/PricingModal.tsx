import { X } from "lucide-react";
import { useState } from "react";
import type { DownloadFormat, PricingOption } from "../paymentTypes";
import { PRICING_OPTIONS } from "../paymentTypes";

type PricingModalProps = {
  onSelect: (option: PricingOption, format: DownloadFormat) => void;
  onClose: () => void;
};

export function PricingModal({ onSelect, onClose }: PricingModalProps) {
  const [format, setFormat] = useState<DownloadFormat>("png");

  function handleSelect(option: PricingOption) {
    onSelect(option, format);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>下载架构图</h2>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="format-selector">
          <span className="format-label">格式：</span>
          <label className="format-option">
            <input
              type="radio"
              name="format"
              value="png"
              checked={format === "png"}
              onChange={() => setFormat("png")}
            />
            PNG
          </label>
          <label className="format-option">
            <input
              type="radio"
              name="format"
              value="pdf"
              checked={format === "pdf"}
              onChange={() => setFormat("pdf")}
            />
            PDF
          </label>
        </div>

        <div className="pricing-cards">
          {PRICING_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`pricing-card${option.id === "free" ? " pricing-card-free" : ""}`}
              onClick={() => handleSelect(option)}
            >
              <span className="pricing-label">{option.label}</span>
              <span className="pricing-subtitle">{option.subtitle}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
