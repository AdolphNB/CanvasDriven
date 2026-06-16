import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the command bar demo shell', () => {
    render(<App />);

    expect(screen.getByText('CanvasDriven')).toBeInTheDocument();
    expect(screen.getByText('需求讨论')).toBeInTheDocument();
    expect(screen.getByText('Mermaid Preview')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Speak or type an architecture idea')).toBeInTheDocument();
  });
});
