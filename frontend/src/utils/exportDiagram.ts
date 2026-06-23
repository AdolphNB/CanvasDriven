import { jsPDF } from "jspdf";

type ExportOptions = {
  format: "png" | "pdf";
  watermark: boolean;
};

const SVG_NS = "http://www.w3.org/2000/svg";
const EXPORT_SCALE = 4;

const EXPORT_FONT_FAMILY = "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

function extractSvgElement(): SVGSVGElement | null {
  const container = document.querySelector(".diagram-svg");
  if (!container) return null;
  return container.querySelector("svg");
}

function resolveSvgDimensions(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  const bbox = svg.getBoundingClientRect();
  if (bbox.width > 0 && bbox.height > 0) {
    return { width: bbox.width, height: bbox.height };
  }

  const w = parseFloat(svg.getAttribute("width") || "0");
  const h = parseFloat(svg.getAttribute("height") || "0");
  if (w > 0 && h > 0) {
    return { width: w, height: h };
  }

  return { width: 960, height: 600 };
}

function ensureFontInSvg(clone: SVGSVGElement): void {
  const existingStyles = clone.querySelectorAll("style");
  let hasFontFace = false;
  for (const s of existingStyles) {
    if (s.textContent?.includes("@font-face")) {
      hasFontFace = true;
      break;
    }
  }

  if (!hasFontFace) {
    const defs = clone.querySelector("defs") || (() => {
      const d = document.createElementNS(SVG_NS, "defs");
      clone.insertBefore(d, clone.firstChild);
      return d;
    })();

    const styleEl = document.createElementNS(SVG_NS, "style");
    styleEl.setAttribute("type", "text/css");
    styleEl.textContent = `svg { font-family: ${EXPORT_FONT_FAMILY}; }`;
    defs.appendChild(styleEl);
  }

  if (!clone.getAttribute("font-family")) {
    clone.setAttribute("font-family", EXPORT_FONT_FAMILY);
  }
}

function addWhiteBackground(clone: SVGSVGElement): void {
  const bgRect = document.createElementNS(SVG_NS, "rect");
  bgRect.setAttribute("width", "100%");
  bgRect.setAttribute("height", "100%");
  bgRect.setAttribute("fill", "#ffffff");
  clone.insertBefore(bgRect, clone.firstChild);
}

function addWatermark(svg: SVGSVGElement, width: number, height: number): void {
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));

  const defs = document.createElementNS(SVG_NS, "defs");
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", "cd-watermark");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("width", "320");
  pattern.setAttribute("height", "180");

  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", "20");
  text.setAttribute("y", "100");
  text.setAttribute("fill", "rgba(15,118,110,0.12)");
  text.setAttribute("font-size", "24");
  text.setAttribute("font-family", EXPORT_FONT_FAMILY);
  text.setAttribute("font-weight", "700");
  text.setAttribute("transform", "rotate(-30, 160, 90)");
  const dateStr = new Date().toLocaleDateString("zh-CN");
  text.textContent = `CanvasDriven \u6C34\u5370 ${dateStr}`;
  pattern.appendChild(text);
  defs.appendChild(pattern);
  svg.insertBefore(defs, svg.firstChild);

  const rect = document.createElementNS(SVG_NS, "rect");
  rect.setAttribute("width", "100%");
  rect.setAttribute("height", "100%");
  rect.setAttribute("fill", "url(#cd-watermark)");
  svg.appendChild(rect);
}

function svgToDataUrl(svgClone: SVGSVGElement): string {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgClone);
  const encoded = encodeURIComponent(svgString);
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

async function svgToCanvas(dataUrl: string, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.scale(EXPORT_SCALE, EXPORT_SCALE);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
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

  // 1. Resolve real dimensions while the original SVG is still in the DOM
  const { width, height } = resolveSvgDimensions(svgEl);

  // 2. Clone the SVG
  const clone = svgEl.cloneNode(true) as SVGSVGElement;

  // 3. Ensure the xmlns attribute is present for standalone SVG rendering
  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", SVG_NS);
  }

  // 4. Add white background as the first element (behind everything)
  addWhiteBackground(clone);

  // 5. Ensure font-family is available in the standalone SVG
  ensureFontInSvg(clone);

  // 6. Set correct pixel dimensions on the clone
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));

  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }

  // 7. Add watermark if needed (after dimensions are set)
  if (options.watermark) {
    addWatermark(clone, width, height);
  }

  // 8. Render to canvas and export
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
