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
    label: "5元 请老板吃颗糖",
    subtitle: "无水印下载",
    amount: 5,
    watermark: false,
    goodsName: "架构图下载-5元请老板吃颗糖",
  },
  {
    id: "token",
    label: "2元 我就出token费",
    subtitle: "无水印下载",
    amount: 2,
    watermark: false,
    goodsName: "架构图下载-2元token费",
  },
  {
    id: "drink",
    label: "10元 赏蜜雪冰橙一杯",
    subtitle: "无水印下载",
    amount: 10,
    watermark: false,
    goodsName: "架构图下载-10元赏蜜雪冰橙一杯",
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
