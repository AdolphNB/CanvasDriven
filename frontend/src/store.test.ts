import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasStore } from './store';
import type { CanvasEvent } from './types';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
beforeEach(() => {
  vi.useFakeTimers();
  useCanvasStore.setState({ messages: [], pendingUserMessages: [], isThinking: false, requestError: null });
});

describe('request recovery', () => {
  it('shows the sent prompt before any response and reconciles the server echo', () => {
    useCanvasStore.setState({ socket: { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket });
    const store = useCanvasStore.getState();
    expect(store.sendCommand({ type: 'chat.submit', text: '设计聊天系统' })).toBe(true);
    expect(useCanvasStore.getState().messages).toEqual([
      expect.objectContaining({ role: 'user', content: '设计聊天系统' }),
    ]);
    expect(useCanvasStore.getState().isThinking).toBe(true);

    const confirmed = { role: 'user', content: '设计聊天系统', createdAt: '2026-09-20T12:00:00Z' };
    store.applyEvent({ id: 'echo', type: 'chat.message', payload: confirmed } as CanvasEvent);
    expect(useCanvasStore.getState().messages).toEqual([confirmed]);
    expect(useCanvasStore.getState().pendingUserMessages).toHaveLength(0);

    // Sending the same text again is a new message, not a duplicate to discard.
    store.sendCommand({ type: 'chat.submit', text: '设计聊天系统' });
    store.applyEvent({ id: 'echo-2', type: 'chat.message', payload: { ...confirmed, createdAt: '2026-09-20T12:01:00Z' } } as CanvasEvent);
    expect(useCanvasStore.getState().messages).toHaveLength(2);
    expect(useCanvasStore.getState().pendingUserMessages).toHaveLength(0);
  });

  it('does not display a sent message if the socket send throws', () => {
    useCanvasStore.setState({ socket: { readyState: WebSocket.OPEN, send: () => { throw new Error('closed'); } } as unknown as WebSocket });
    expect(useCanvasStore.getState().sendCommand({ type: 'chat.submit', text: '需求' })).toBe(false);
    expect(useCanvasStore.getState().messages).toHaveLength(0);
    expect(useCanvasStore.getState().pendingUserMessages).toHaveLength(0);
  });

  it('restarts the inactivity timeout for each streamed chunk and retains partial text', () => {
    vi.useFakeTimers();
    useCanvasStore.setState({ socket: { readyState: WebSocket.OPEN, send: vi.fn() } as unknown as WebSocket, isThinking: false, requestError: null, streamingAssistantText: '' });
    expect(useCanvasStore.getState().sendCommand({ type: 'chat.submit', text: '需求' })).toBe(true);
    vi.advanceTimersByTime(50_000);
    useCanvasStore.getState().applyEvent({ id: 'delta', type: 'architect.delta', payload: { content: '部分回复' } } as CanvasEvent);
    vi.advanceTimersByTime(50_000);
    expect(useCanvasStore.getState().isThinking).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(useCanvasStore.getState().isThinking).toBe(false);
    expect(useCanvasStore.getState().requestError).toContain('超时');
    expect(useCanvasStore.getState().streamingAssistantText).toBe('部分回复');
  });

  it('reports a failed send instead of accepting and losing the draft', () => {
    useCanvasStore.setState({ socket: null });
    expect(useCanvasStore.getState().sendCommand({ type: 'chat.submit', text: '需求' })).toBe(false);
    expect(useCanvasStore.getState().requestError).toContain('未发送');
  });
});
