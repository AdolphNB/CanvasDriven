import { Minus, Plus, RotateCcw } from 'lucide-react';
import { PointerEvent, WheelEvent, useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  htmlLabels: false,
  themeVariables: {
    primaryColor: '#ecfeff',
    primaryBorderColor: '#0891b2',
    primaryTextColor: '#0f172a',
    lineColor: '#475569',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#eef2ff',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
});

type MermaidPaneProps = {
  code: string;
};

export function MermaidPane({ code }: MermaidPaneProps) {
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function clampZoom(value: number) {
    return Math.min(3, Math.max(0.5, value));
  }

  function changeZoom(delta: number) {
    setZoom((current) => clampZoom(Number((current + delta).toFixed(2))));
  }

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const result = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
          resetView();
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : 'Unable to render Mermaid diagram');
        }
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code, id]);

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    changeZoom(event.deltaY > 0 ? -0.1 : 0.1);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="mermaid-pane">
      <div className="diagram-header">
        <div>
          <span className="eyebrow">Live Architecture</span>
          <h2>Mermaid Preview</h2>
        </div>
        <div className="diagram-controls" aria-label="Diagram view controls">
          <button type="button" title="Zoom out" onClick={() => changeZoom(-0.1)}>
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" title="Zoom in" onClick={() => changeZoom(0.1)}>
            <Plus size={15} />
          </button>
          <button type="button" title="Reset view" onClick={resetView}>
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      <div
        className={`diagram-surface${dragRef.current ? ' is-dragging' : ''}`}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {error ? (
          <pre className="diagram-error">{error}</pre>
        ) : (
          <div
            className="diagram-viewport"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        )}
      </div>
    </section>
  );
}
