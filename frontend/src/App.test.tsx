import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { useCanvasStore } from './store';

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn().mockResolvedValue({ svg: '<svg viewBox="0 0 100 50"></svg>' }) } }));

beforeEach(() => {
  useCanvasStore.setState({ connect: vi.fn(), sendCommand: vi.fn().mockReturnValue(true), connectionState: 'connected', messages: [], streamingAssistantText: '', isThinking: false, requestError: null });
});

describe('App', () => {
  it('renders the architect chat shell with a multiline prompt and diagram controls', () => {
    render(<App />);

    expect(screen.getByText('CanvasDriven')).toBeInTheDocument();
    expect(screen.getByText('需求讨论')).toBeInTheDocument();
    expect(screen.getByText('架构预览')).toBeInTheDocument();
    expect(screen.getByTitle('缩小')).toBeInTheDocument();
    expect(screen.getByTitle('放大')).toBeInTheDocument();
    expect(screen.getByTitle('适应画布')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('描述你的系统目标，或继续追问方案…').tagName).toBe('TEXTAREA');
  });

  it('does not render browser-side LLM configuration controls', () => {
    render(<App />);

    expect(screen.queryByPlaceholderText(/api key/i)).not.toBeInTheDocument();
    expect(screen.queryByTitle('Apply LLM config')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('OpenAI')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Responses')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).not.toBeInTheDocument();
  });
});


describe('prompt interactions', () => {
  it('preserves the draft during IME composition, newline and failed sends', () => {
    render(<App />);
    const prompt = screen.getByRole('textbox', { name: '架构需求' });
    const send = vi.fn().mockReturnValue(false);
    act(() => useCanvasStore.setState({ sendCommand: send }));
    fireEvent.change(prompt, { target: { value: '设计聊天系统' } });
    fireEvent.keyDown(prompt, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(prompt, { key: 'Enter', shiftKey: true });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(prompt, { key: 'Enter' });
    expect(prompt).toHaveValue('设计聊天系统');
    send.mockReturnValue(true);
    fireEvent.keyDown(prompt, { key: 'Enter' });
    expect(prompt).toHaveValue('');
    expect(send).toHaveBeenLastCalledWith({ type: 'chat.submit', text: '设计聊天系统' });
  });

  it('fills an example without sending it', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '设计一个支持库存和支付的电商系统' }));
    expect(screen.getByRole('textbox')).toHaveValue('设计一个支持库存和支付的电商系统');
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(useCanvasStore.getState().sendCommand).not.toHaveBeenCalled();
  });

  it('does not move a reader away from older messages when a reply arrives', () => {
    render(<App />);
    const messages = screen.getByLabelText('需求讨论记录');
    Object.defineProperties(messages, { scrollHeight: { value: 1000 }, clientHeight: { value: 300 } });
    messages.scrollTop = 100;
    fireEvent.scroll(messages);
    act(() => useCanvasStore.setState({ streamingAssistantText: '新回复' }));
    expect(messages.scrollTop).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: '回到最新消息 ↓' }));
    expect(messages.scrollTop).toBe(1000);
  });
});
