import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'base',
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

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        const result = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(result.svg);
          setError(null);
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

  return (
    <section className="mermaid-pane">
      <div className="diagram-header">
        <div>
          <span className="eyebrow">Live Architecture</span>
          <h2>Mermaid Preview</h2>
        </div>
      </div>
      <div className="diagram-surface">
        {error ? <pre className="diagram-error">{error}</pre> : <div className="diagram-svg" dangerouslySetInnerHTML={{ __html: svg }} />}
      </div>
    </section>
  );
}
