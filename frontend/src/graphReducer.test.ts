import { describe, expect, it } from 'vitest';
import { applyEventToGraph, emptyGraph } from './graphReducer';
import type { CanvasEvent } from './types';

const baseEvent = {
  id: 'evt-1',
  sessionId: 's1',
  layer: 'sandbox',
  targetCanvas: 'draft',
  createdAt: new Date().toISOString(),
} satisfies Partial<CanvasEvent>;

describe('applyEventToGraph', () => {
  it('applies node and edge events incrementally', () => {
    const n1 = {
      ...baseEvent,
      id: 'evt-node-1',
      type: 'node.add',
      payload: { id: 'n1', kind: 'concept', label: 'A', data: {}, position: { x: 0, y: 0 } },
    } as CanvasEvent;
    const n2 = {
      ...baseEvent,
      id: 'evt-node-2',
      type: 'node.add',
      payload: { id: 'n2', kind: 'module', label: 'B', data: {}, position: { x: 100, y: 0 } },
    } as CanvasEvent;
    const e1 = {
      ...baseEvent,
      id: 'evt-edge-1',
      type: 'edge.add',
      payload: { id: 'e1', source: 'n1', target: 'n2', kind: 'flow' },
    } as CanvasEvent;

    const graph = [n1, n2, e1].reduce(applyEventToGraph, emptyGraph());

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    expect(graph.version).toBe(3);
  });

  it('removes incident edges when a node is removed', () => {
    const graph = {
      nodes: [
        { id: 'n1', kind: 'concept' as const, label: 'A', data: {}, position: { x: 0, y: 0 } },
        { id: 'n2', kind: 'module' as const, label: 'B', data: {}, position: { x: 1, y: 1 } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', kind: 'flow' as const }],
      version: 0,
    };

    const next = applyEventToGraph(graph, {
      ...baseEvent,
      id: 'evt-remove',
      type: 'node.remove',
      payload: { id: 'n1' },
    } as CanvasEvent);

    expect(next.nodes).toHaveLength(1);
    expect(next.edges).toHaveLength(0);
  });
});
