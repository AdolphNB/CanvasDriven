import { Download } from "lucide-react";

type DownloadButtonProps = {
  disabled: boolean;
  onClick: () => void;
};

export function DownloadButton({ disabled, onClick }: DownloadButtonProps) {
  return (
    <button
      type="button"
      className="download-btn"
      disabled={disabled}
      onClick={onClick}
      title="下载架构图"
    >
      <Download size={16} />
      下载
    </button>
  );
}
