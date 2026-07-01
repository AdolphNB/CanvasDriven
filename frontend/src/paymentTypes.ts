export type DownloadFormat = "png" | "pdf";

export type PricingOption = {
  id: string;
  label: string;
  subtitle: string;
  amount: number;
  watermark: boolean;
  goodsName: string;
};

export type PaymentOrder = {
  orderId: string;
  amount: number;
  format: DownloadFormat;
  watermark: boolean;
  wechatUrl: string | null;
};

export const PRICING_OPTIONS: PricingOption[] = [
  {
    id: "candy",
    label: "¥1.98 请老板吃颗糖",
    subtitle: "无水印下载",
    amount: 1.98,
    watermark: false,
    goodsName: "架构图下载-1.98元请老板吃颗糖",
  },
  {
    id: "token",
    label: "¥0.98 我就出token费",
    subtitle: "无水印下载",
    amount: 0.98,
    watermark: false,
    goodsName: "架构图下载-0.98元token费",
  },
  {
    id: "drink",
    label: "¥4.98 赏蜜雪冰橙一杯",
    subtitle: "无水印下载",
    amount: 4.98,
    watermark: false,
    goodsName: "架构图下载-4.98元赏蜜雪冰橙一杯",
  },
  {
    id: "free",
    label: "我要免费",
    subtitle: "图片将带 CanvasDriven 水印",
    amount: 0,
    watermark: true,
    goodsName: "",
  },
];
