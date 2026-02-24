import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebtStore } from './store/debtStore';
import { useSettingsStore } from './store/settingsStore';
import { useWorkspaceStore } from './store/workspaceStore';

const tauriMocks = vi.hoisted(() => {
  const getSettings = vi.fn(async (_workspacePath: string) => ({
    schema_version: 2,
    gitHistoryDays: 90,
    churnNormalizationPercentile: 90,
    weights: {
      churn_rate: 0.22,
      code_smell_density: 0.2,
      coupling_index: 0.18,
      change_coupling: 0.12,
      test_coverage_gap: 0.12,
      knowledge_concentration: 0.08,
      cyclomatic_complexity: 0.05,
      decision_staleness: 0.03,
    },
    warningThreshold: 65,
    criticalThreshold: 80,
    busFactor: 70,
    colorScheme: 'default',
    nodeLabel: 'always',
    animationsEnabled: true,
    snapshotSchedule: 'weekly',
    snapshotRetention: 52,
    notificationsEnabled: true,
  }));

  return {
    runFullAnalysis: vi.fn(async () => ({
      workspace_score: 42,
      file_count: 1,
      high_debt_count: 0,
      files: [],
      duration_ms: 10,
    })),
    onAnalysisProgress: vi.fn(async () => () => { }),
    startFileWatcher: vi.fn(async () => { }),
    takeSnapshot: vi.fn(async () => ({
      id: 1,
      timestamp: 1,
      composite_score: 42,
      file_count: 1,
      high_debt_count: 0,
      commit_count_week: 0,
      snapshot_metadata: null,
    })),
    getSettings,
    saveSettings: vi.fn(async (workspacePath: string, settings: unknown) => ({
      ...(await getSettings(workspacePath)),
      ...(settings as Record<string, unknown>),
    })),
  };
});

vi.mock('./components/layout/TitleBar', () => ({
  TitleBar: () => <div data-testid="titlebar">Title</div>,
}));
vi.mock('./components/layout/LeftPanel', () => ({
  LeftPanel: () => <div data-testid="left-panel">Left</div>,
}));
vi.mock('./components/layout/MainContent', () => ({
  MainContent: () => <div data-testid="main-content">Main</div>,
}));
vi.mock('./components/layout/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar">Status</div>,
}));
vi.mock('./components/onboarding/AnalysisProgress', () => ({
  AnalysisProgress: () => <div data-testid="analysis-progress">Progress</div>,
}));
vi.mock('./components/onboarding/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state">Empty</div>,
}));
vi.mock('./components/onboarding/FileWatcher', () => ({
  FileWatcher: () => <div data-testid="file-watcher">Watcher</div>,
}));

vi.mock('./lib/tauri', () => ({
  runFullAnalysis: tauriMocks.runFullAnalysis,
  onAnalysisProgress: tauriMocks.onAnalysisProgress,
  startFileWatcher: tauriMocks.startFileWatcher,
  takeSnapshot: tauriMocks.takeSnapshot,
  getSettings: tauriMocks.getSettings,
  saveSettings: tauriMocks.saveSettings,
}));

import App from './App';

describe('App smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWorkspaceStore.setState({
      workspace: null,
      isLoading: false,
      error: null,
      recentPaths: [],
    });
    useDebtStore.setState({
      analysisResult: null,
      heatmapData: null,
      isAnalyzing: false,
      analysisProgress: null,
      selectedFile: null,
      activeView: 'heatmap',
    });
    useSettingsStore.setState({
      schema_version: 2,
      gitHistoryDays: 90,
      churnNormalizationPercentile: 90,
      weights: {
        churn_rate: 0.22,
        code_smell_density: 0.2,
        coupling_index: 0.18,
        change_coupling: 0.12,
        test_coverage_gap: 0.12,
        knowledge_concentration: 0.08,
        cyclomatic_complexity: 0.05,
        decision_staleness: 0.03,
      },
      warningThreshold: 65,
      criticalThreshold: 80,
      busFactor: 70,
      colorScheme: 'default',
      nodeLabel: 'always',
      animationsEnabled: true,
      snapshotSchedule: 'weekly',
      snapshotRetention: 52,
      notificationsEnabled: true,
      isHydrated: false,
    });
  });

  it('renders onboarding empty state when no workspace is selected', () => {
    render(<App />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('titlebar')).toBeInTheDocument();
    expect(screen.getByTestId('status-bar')).toBeInTheDocument();
  });

  it('renders workspace shell and starts analysis lifecycle when workspace exists', async () => {
    useWorkspaceStore.setState({
      workspace: {
        path: '/tmp/repo',
        repo_name: 'repo',
        branch: 'main',
        file_count: 1,
        last_analysis_at: null,
      },
    });

    render(<App />);

    expect(screen.getByTestId('left-panel')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
    expect(screen.getByTestId('file-watcher')).toBeInTheDocument();

    await waitFor(() => {
      expect(tauriMocks.runFullAnalysis).toHaveBeenCalledWith('/tmp/repo');
      expect(tauriMocks.startFileWatcher).toHaveBeenCalledWith('/tmp/repo');
      expect(tauriMocks.getSettings).toHaveBeenCalledWith('/tmp/repo');
    });
  });
});
