import { jsPDF } from "jspdf";

type ExportOptions = {
  format: "png" | "pdf";
  watermark: boolean;
};

function extractSvgElement(): SVGSVGElement | null {
  const container = document.querySelector(".diagram-svg");
  if (!container) return null;
  return container.querySelector("svg");
}

function addWatermark(svg: SVGSVGElement): void {
  const ns = "http://www.w3.org/2000/svg";
  const bbox = svg.getBoundingClientRect();
  const width = bbox.width || 960;
  const height = bbox.height || 600;

  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  const defs = document.createElementNS(ns, "defs");
  const pattern = document.createElementNS(ns, "pattern");
  pattern.setAttribute("id", "cd-watermark");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", "320");
  pattern.setAttribute("height", "180");

  const text = document.createElementNS(ns, "text");
  text.setAttribute("x", "20");
  text.setAttribute("y", "100");
  text.setAttribute("fill", "rgba(15,118,110,0.12)");
  text.setAttribute("font-size", "24");
  text.setAttribute("font-family", "Inter, sans-serif");
  text.setAttribute("font-weight", "700");
  text.setAttribute("transform", "rotate(-30, 160, 90)");
  const dateStr = new Date().toLocaleDateString("zh-CN");
  text.textContent = `CanvasDriven \u6C34\u5370 ${dateStr}`;
  pattern.appendChild(text);
  defs.appendChild(pattern);
  svg.insertBefore(defs, svg.firstChild);

  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", "url(#cd-watermark)");
  svg.appendChild(rect);
}

function inlineStyles(svg: SVGSVGElement): void {
  const allElements = svg.querySelectorAll("*");
  for (const el of allElements) {
    if (!(el instanceof SVGElement || el instanceof HTMLElement)) continue;
    const computed = window.getComputedStyle(el);
    const style = el.style;
    const importantProps = [
      "fill", "stroke", "stroke-width", "font-family", "font-size",
      "font-weight", "text-anchor", "dominant-baseline", "color",
      "background", "opacity", "marker-end", "marker-start",
    ];
    for (const prop of importantProps) {
      const val = computed.getPropertyValue(prop);
      if (val && val !== "none" && val !== "") {
        style.setProperty(prop, val);
      }
    }
  }
}

function svgToDataUrl(svgClone: SVGSVGElement): string {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgClone);
  const encoded = encodeURIComponent(svgString);
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

async function svgToCanvas(dataUrl: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.scale(scale, scale);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Failed to load SVG image"));
    img.src = dataUrl;
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportDiagram(options: ExportOptions): Promise<void> {
  const svgEl = extractSvgElement();
  if (!svgEl) throw new Error("No diagram SVG found");

  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  if (options.watermark) {
    addWatermark(clone);
  }

  inlineStyles(clone);

  let width = parseFloat(clone.getAttribute("width") || "960");
  let height = parseFloat(clone.getAttribute("height") || "600");
  if (!width || !height) {
    const bbox = svgEl.getBoundingClientRect();
    width = bbox.width || 960;
    height = bbox.height || 600;
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
  }

  const dataUrl = svgToDataUrl(clone);
  const canvas = await svgToCanvas(dataUrl, width, height);

  const timestamp = new Date().toISOString().slice(0, 10);

  if (options.format === "png") {
    canvas.toBlob((blob) => {
      if (!blob) throw new Error("PNG export failed");
      downloadBlob(blob, `CanvasDriven-${timestamp}.png`);
    }, "image/png");
  } else {
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation: width > height ? "landscape" : "portrait",
      unit: "px",
      format: [width, height],
    });
    pdf.addImage(imgData, "PNG", 0, 0, width, height);
    pdf.save(`CanvasDriven-${timestamp}.pdf`);
  }
}
