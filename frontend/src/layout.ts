import dagre from 'dagre';
import type { CanvasGraph } from './types';

const NODE_WIDTH = 180;
const NODE_HEIGHT = 58;

export function layoutGraph(graph: CanvasGraph, direction: 'LR' | 'TB' = 'LR'): CanvasGraph {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 70, ranksep: 110 });

  graph.nodes.forEach((node) => dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  graph.edges.forEach((edge) => dagreGraph.setEdge(edge.source, edge.target));
  dagre.layout(dagreGraph);

  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const layoutNode = dagreGraph.node(node.id);
      if (!layoutNode) return node;
      return {
        ...node,
        position: {
          x: layoutNode.x - NODE_WIDTH / 2,
          y: layoutNode.y - NODE_HEIGHT / 2,
        },
      };
    }),
  };
}
