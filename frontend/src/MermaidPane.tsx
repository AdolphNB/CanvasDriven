import { GitBranch, Minus, MousePointer2, Plus, RotateCcw } from 'lucide-react';
import { PointerEvent, useEffect, useId, useRef, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
  htmlLabels: false,
  themeVariables: {
    primaryColor: '#f0f7f4',
    primaryBorderColor: '#5c9484',
    primaryTextColor: '#0f172a',
    lineColor: '#7c9690',
    secondaryColor: '#f8fafc',
    tertiaryColor: '#eef2ff',
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
  },
});

type MermaidPaneProps = {
  code: string;
  isPlaceholder?: boolean;
  onReadyChange?: (ready: boolean) => void;
};

export function MermaidPane({ code, onReadyChange, isPlaceholder = false }: MermaidPaneProps) {
  const rawId = useId();
  const id = `mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const surfaceRef = useRef<HTMLDivElement | null>(null);
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
    setLoading(true);
    setError(null);
    onReadyChange?.(false);

    async function renderDiagram() {
      try {
        const result = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(result.svg);
          onReadyChange?.(true);
          setError(null);
          resetView();
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : '暂时无法绘制架构图');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    renderDiagram();
    return () => {
      cancelled = true;
    };
  }, [code, id, onReadyChange]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setZoom((current) => clampZoom(Number((current + (event.deltaY > 0 ? -0.1 : 0.1)).toFixed(2))));
    }
    surface.addEventListener('wheel', handleWheel, { passive: false });
    return () => surface.removeEventListener('wheel', handleWheel);
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    setDragging(true);
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
    setDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section className="mermaid-pane">
      <div className="diagram-header">
        <div className="panel-title"><span className="panel-icon"><GitBranch size={18} /></span><div><h2>架构预览</h2><p>{isPlaceholder ? '从一次讨论开始，让系统一目了然' : '随讨论实时更新'}</p></div></div>
        <div className="diagram-controls" aria-label="图表视图控制">
          <button type="button" title="缩小" aria-label="缩小" disabled={zoom <= 0.5} onClick={() => changeZoom(-0.1)}>
            <Minus size={15} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" title="放大" aria-label="放大" disabled={zoom >= 3} onClick={() => changeZoom(0.1)}>
            <Plus size={15} />
          </button>
          <button type="button" title="适应画布" aria-label="适应画布" onClick={resetView}>
            <RotateCcw size={15} />
          </button>
        </div>
      </div>
      <div
        className={`diagram-surface${dragging ? ' is-dragging' : ''}`}
        aria-busy={loading}
        ref={surfaceRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {isPlaceholder && <span className="canvas-badge"><span /> 架构生成流程 · 示例</span>}
        {loading ? <div className="thinking" role="status">正在绘制架构图…</div> : error ? (
          <div className="diagram-error" role="alert"><strong>架构图暂时无法显示</strong><p>请在左侧发送“修复架构图语法”后重试。</p><details><summary>查看错误详情</summary><pre>{error}</pre></details></div>
        ) : (
          <div
            className={`diagram-viewport${isPlaceholder ? ' diagram-placeholder' : ''}`}
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        )}
      </div>
      <p className="diagram-hint"><MousePointer2 size={13} />拖动平移 · Ctrl / ⌘ + 滚轮缩放 · 点击复位适应画布</p>
    </section>
  );
}
