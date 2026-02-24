import React, { useEffect, useRef } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { LeftPanel } from './components/layout/LeftPanel';
import { MainContent } from './components/layout/MainContent';
import { StatusBar } from './components/layout/StatusBar';
import { AnalysisProgress } from './components/onboarding/AnalysisProgress';
import { EmptyState } from './components/onboarding/EmptyState';
import { FileWatcher } from './components/onboarding/FileWatcher';
import { useWorkspaceStore } from './store/workspaceStore';
import { useDebtStore } from './store/debtStore';
import { useSettingsStore } from './store/settingsStore';
import { runFullAnalysis, onAnalysisProgress, startFileWatcher, takeSnapshot } from './lib/tauri';

function settingsSignature(state: ReturnType<typeof useSettingsStore.getState>): string {
  return JSON.stringify({
    gitHistoryDays: state.gitHistoryDays,
    churnNormalizationPercentile: state.churnNormalizationPercentile,
    weights: state.weights,
    warningThreshold: state.warningThreshold,
    criticalThreshold: state.criticalThreshold,
    busFactor: state.busFactor,
    colorScheme: state.colorScheme,
    nodeLabel: state.nodeLabel,
    animationsEnabled: state.animationsEnabled,
    snapshotSchedule: state.snapshotSchedule,
    snapshotRetention: state.snapshotRetention,
    notificationsEnabled: state.notificationsEnabled,
  });
}

const App: React.FC = () => {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setIsAnalyzing = useDebtStore((s) => s.setIsAnalyzing);
  const setAnalysisProgress = useDebtStore((s) => s.setAnalysisProgress);
  const setAnalysisResult = useDebtStore((s) => s.setAnalysisResult);
  const setActiveView = useDebtStore((s) => s.setActiveView);
  const hydrateFromWorkspace = useSettingsStore((s) => s.hydrateFromWorkspace);
  const persistToWorkspace = useSettingsStore((s) => s.persistToWorkspace);
  const isSettingsHydrated = useSettingsStore((s) => s.isHydrated);
  const settingsState = useSettingsStore((s) => s);
  const lastPersistedSettingsRef = useRef<string>('');
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-run analysis + start file watcher when workspace opens
  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;

    const run = async () => {
      setIsAnalyzing(true);
      try {
        await hydrateFromWorkspace(workspace.path);
      } catch (_) {
        // Ignore settings hydration failures and continue with backend defaults.
      }

      if (cancelled) return;
      lastPersistedSettingsRef.current = settingsSignature(useSettingsStore.getState());

      const unlisten = await onAnalysisProgress((progress) => {
        if (!cancelled) {
          setAnalysisProgress({
            current: progress.current,
            total: progress.total,
            currentFile: progress.current_file,
          });
        }
      });

      try {
        const result = await runFullAnalysis(workspace.path);
        if (!cancelled) {
          setAnalysisResult(result);
          // Auto-snapshot with top-10 file metadata for per-file history tracking
          const top10 = [...result.files]
            .sort((a, b) => b.composite_score - a.composite_score)
            .slice(0, 10)
            .map((f) => ({ path: f.relative_path, score: f.composite_score }));
          const metadataJson = JSON.stringify(top10);
          takeSnapshot(
            workspace.path,
            result.workspace_score,
            result.file_count,
            result.high_debt_count,
            0,
            metadataJson,
          ).catch(() => { });
        }
      } finally {
        if (!cancelled) {
          setIsAnalyzing(false);
          setAnalysisProgress(null);
        }
        unlisten();
      }

      // Start file watcher (best-effort, errors are non-fatal)
      startFileWatcher(workspace.path).catch(() => { });
    };

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.path, hydrateFromWorkspace]);

  // Persist settings to backend (debounced) after local changes.
  useEffect(() => {
    if (!workspace || !isSettingsHydrated) return;

    const currentSignature = settingsSignature(settingsState);
    if (currentSignature === lastPersistedSettingsRef.current) return;

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(() => {
      const pendingSignature = settingsSignature(useSettingsStore.getState());
      lastPersistedSettingsRef.current = pendingSignature;
      persistToWorkspace(workspace.path)
        .then(() => {
          lastPersistedSettingsRef.current = settingsSignature(useSettingsStore.getState());
        })
        .catch(() => {
          // Keep local edits even if persistence fails; next change retries.
          lastPersistedSettingsRef.current = '';
        });
    }, 350);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [workspace?.path, isSettingsHydrated, settingsState, persistToWorkspace]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case '1': e.preventDefault(); setActiveView('heatmap'); break;
          case '2': e.preventDefault(); setActiveView('fixfirst'); break;
          case '3': e.preventDefault(); setActiveView('timeline'); break;
          case '4': e.preventDefault(); setActiveView('register'); break;
          case '5': e.preventDefault(); setActiveView('budget'); break;
          case ',': e.preventDefault(); setActiveView('settings'); break;
          case 'r':
            e.preventDefault();
            if (workspace) {
              setIsAnalyzing(true);
              persistToWorkspace(workspace.path)
                .catch(() => { })
                .then(() => runFullAnalysis(workspace.path))
                .then(setAnalysisResult)
                .finally(() => {
                  setIsAnalyzing(false);
                  setAnalysisProgress(null);
                });
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workspace, setActiveView, setIsAnalyzing, setAnalysisResult, setAnalysisProgress]);

  // No workspace → full EmptyState
  if (!workspace) {
    return (
      <div className="app-layout">
        <TitleBar />
        <div className="main-content" style={{ gridColumn: '1 / -1' }}>
          <EmptyState />
        </div>
        <StatusBar />
        <AnalysisProgress />
      </div>
    );
  }

  return (
    <div className="app-layout">
      <TitleBar />
      <LeftPanel />
      <MainContent />
      <StatusBar />
      <AnalysisProgress />
      <FileWatcher />
    </div>
  );
};

export default App;
