import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportDiagram } from "./exportDiagram";

describe("exportDiagram", () => {
  const originalImage = globalThis.Image;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  let canvases: HTMLCanvasElement[];
  let imageSources: string[];

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";

    canvases = [];
    imageSources = [];

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
      canvases.push(this);
      return {
        scale: vi.fn(),
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        fillStyle: "",
      } as unknown as CanvasRenderingContext2D;
    });

    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (callback) {
      callback(new Blob(["png"], { type: "image/png" }));
    });

    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    URL.createObjectURL = vi.fn(() => "blob:export");
    URL.revokeObjectURL = vi.fn();

    class ImageMock {
      crossOrigin = "";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        imageSources.push(value);
        queueMicrotask(() => this.onload?.());
      }
    }

    globalThis.Image = ImageMock as unknown as typeof Image;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    globalThis.Image = originalImage;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it("renders PNG exports at 4x source resolution for sharp downloaded images", async () => {
    document.body.innerHTML = `
      <div class="diagram-svg">
        <svg viewBox="0 0 376 446" xmlns="http://www.w3.org/2000/svg">
          <text x="20" y="30">Architecture</text>
        </svg>
      </div>
    `;

    await exportDiagram({ format: "png", watermark: false });

    expect(canvases[0].width).toBe(1504);
    expect(canvases[0].height).toBe(1784);
  });

  it("preserves Mermaid's own SVG styling instead of exporting computed page styles inline", async () => {
    document.head.innerHTML = `
      <style>
        .diagram-svg rect.actor {
          fill: #0f172a;
          stroke: #0891b2;
        }
      </style>
    `;
    document.body.innerHTML = `
      <div class="diagram-svg">
        <svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg">
          <style>
            .actor { fill: #ecfeff; stroke: #0891b2; }
            .messageText { fill: #0f172a; }
          </style>
          <rect class="actor" x="20" y="20" width="120" height="60" />
          <text class="messageText" x="80" y="55">User</text>
        </svg>
      </div>
    `;

    await exportDiagram({ format: "png", watermark: false });

    const serializedSvg = decodeURIComponent(imageSources[0].replace("data:image/svg+xml;charset=utf-8,", ""));
    expect(serializedSvg).toContain(".actor { fill: #ecfeff; stroke: #0891b2; }");
    expect(serializedSvg).not.toContain('style="fill:');
  });
});
