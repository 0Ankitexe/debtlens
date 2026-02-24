import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebtStore } from '../../store/debtStore';
import { MainContent } from './MainContent';

vi.mock('../heatmap/DebtHeatmap', () => ({
  DebtHeatmap: () => <div data-testid="view-heatmap">Heatmap</div>,
}));
vi.mock('../priority/FixThisFirst', () => ({
  FixThisFirst: () => <div data-testid="view-fixfirst">Fix First</div>,
}));
vi.mock('../timeline/DebtTimeline', () => ({
  DebtTimeline: () => <div data-testid="view-timeline">Timeline</div>,
}));
vi.mock('../register/DebtRegister', () => ({
  DebtRegister: () => <div data-testid="view-register">Register</div>,
}));
vi.mock('../budget/DebtBudget', () => ({
  DebtBudget: () => <div data-testid="view-budget">Budget</div>,
}));
vi.mock('../settings/Settings', () => ({
  Settings: () => <div data-testid="view-settings">Settings</div>,
}));

describe('MainContent smoke', () => {
  beforeEach(() => {
    useDebtStore.setState({
      analysisResult: null,
      heatmapData: null,
      isAnalyzing: false,
      analysisProgress: null,
      selectedFile: null,
      activeView: 'heatmap',
    });
  });

  it.each([
    ['heatmap', 'view-heatmap'],
    ['fixfirst', 'view-fixfirst'],
    ['timeline', 'view-timeline'],
    ['register', 'view-register'],
    ['budget', 'view-budget'],
    ['settings', 'view-settings'],
  ])('renders %s view shell', (activeView, testId) => {
    useDebtStore.setState({ activeView: activeView as ReturnType<typeof useDebtStore.getState>['activeView'] });
    render(<MainContent />);
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });
});
