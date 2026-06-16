import type { CanvasEdge, CanvasEvent, CanvasGraph, CanvasNode } from './types';

export const emptyGraph = (): CanvasGraph => ({ nodes: [], edges: [], version: 0 });

export function applyEventToGraph(graph: CanvasGraph, event: CanvasEvent): CanvasGraph {
  const next: CanvasGraph = {
    nodes: [...graph.nodes],
    edges: [...graph.edges],
    version: graph.version,
  };

  switch (event.type) {
    case 'node.add': {
      const node = event.payload as CanvasNode;
      next.nodes = next.nodes.filter((existing) => existing.id !== node.id).concat(node);
      break;
    }
    case 'node.update': {
      const patch = event.payload as Partial<CanvasNode> & { id: string };
      next.nodes = next.nodes.map((node) => (node.id === patch.id ? { ...node, ...patch } : node));
      break;
    }
    case 'node.remove': {
      const { id } = event.payload as { id: string };
      next.nodes = next.nodes.filter((node) => node.id !== id);
      next.edges = next.edges.filter((edge) => edge.source !== id && edge.target !== id);
      break;
    }
    case 'edge.add': {
      const edge = event.payload as CanvasEdge;
      next.edges = next.edges.filter((existing) => existing.id !== edge.id).concat(edge);
      break;
    }
    case 'edge.update': {
      const patch = event.payload as Partial<CanvasEdge> & { id: string };
      next.edges = next.edges.map((edge) => (edge.id === patch.id ? { ...edge, ...patch } : edge));
      break;
    }
    case 'edge.remove': {
      const { id } = event.payload as { id: string };
      next.edges = next.edges.filter((edge) => edge.id !== id);
      break;
    }
    case 'graph.layout': {
      const { positions } = event.payload as { positions: Record<string, { x: number; y: number }> };
      next.nodes = next.nodes.map((node) => (positions[node.id] ? { ...node, position: positions[node.id] } : node));
      break;
    }
    default:
      return graph;
  }

  return { ...next, version: next.version + 1 };
}
