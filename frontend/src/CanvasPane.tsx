import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CanvasGraph, CanvasNode } from './types';

const nodeColors: Record<CanvasNode['kind'], string> = {
  concept: '#f8fafc',
  decision: '#ecfdf5',
  module: '#eef2ff',
  risk: '#fff7ed',
  note: '#fefce8',
};

type CanvasPaneProps = {
  title: string;
  graph: CanvasGraph;
  stable?: boolean;
};

export function CanvasPane({ title, graph, stable = false }: CanvasPaneProps) {
  const nodes: Node[] = graph.nodes.map((node) => ({
    id: node.id,
    position: node.position,
    data: { label: node.label },
    style: {
      width: 180,
      minHeight: 58,
      borderRadius: 8,
      border: stable ? '1px solid #475569' : '1px solid #94a3b8',
      background: nodeColors[node.kind],
      color: '#0f172a',
      boxShadow: stable ? '0 10px 25px rgba(15, 23, 42, 0.12)' : '0 8px 18px rgba(15, 23, 42, 0.08)',
      fontSize: 13,
      lineHeight: 1.35,
      padding: 10,
    },
  }));

  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: !stable,
    type: 'smoothstep',
    style: { stroke: stable ? '#334155' : '#64748b', strokeWidth: stable ? 2 : 1.5 },
  }));

  return (
    <section className={stable ? 'canvas-pane canvas-pane-master' : 'canvas-pane'}>
      <header className="pane-header">
        <div>
          <h2>{title}</h2>
          <span>v{graph.version} · {graph.nodes.length} nodes · {graph.edges.length} edges</span>
        </div>
      </header>
      <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} nodesConnectable={false}>
        <Background gap={18} size={1} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </section>
  );
}
