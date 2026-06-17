import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the architect chat shell with a multiline prompt and diagram controls', () => {
    render(<App />);

    expect(screen.getByText('CanvasDriven')).toBeInTheDocument();
    expect(screen.getByText('需求讨论')).toBeInTheDocument();
    expect(screen.getByText('Mermaid Preview')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom out')).toBeInTheDocument();
    expect(screen.getByTitle('Zoom in')).toBeInTheDocument();
    expect(screen.getByTitle('Reset view')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Speak or type an architecture idea').tagName).toBe('TEXTAREA');
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
