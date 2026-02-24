import React, { useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useDebtStore } from '../../store/debtStore';
import { reanalyzeFile } from '../../lib/tauri';

/**
 * T057/T058: Listens for file_changed events from Tauri watcher,
 * triggers incremental re-analysis on the changed file, and updates
 * the global analysis result so heatmap/other views animate their changes.
 */
export const FileWatcher: React.FC = () => {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setAnalysisResult = useDebtStore((s) => s.setAnalysisResult);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFileChanged = useCallback(
    async (changedPath: string) => {
      const analysisResult = useDebtStore.getState().analysisResult;
      if (!workspace || !analysisResult) return;

      // Only re-analyze source files in the workspace
      if (!changedPath.startsWith(workspace.path)) return;
      if (changedPath.includes('/.debtengine/') || changedPath.includes('/node_modules/') || changedPath.includes('/target/')) return;

      try {
        // Re-run full debt scoring for a single file and merge result in-memory.
        const updatedScore = await reanalyzeFile(workspace.path, changedPath);
        if (!updatedScore) return;

        const existingIndex = analysisResult.files.findIndex(
          (f) => f.path === updatedScore.path || f.relative_path === updatedScore.relative_path,
        );
        const nextFiles =
          existingIndex === -1
            ? [...analysisResult.files, updatedScore]
            : analysisResult.files.map((f, index) => (index === existingIndex ? updatedScore : f));

        const nextFileCount = nextFiles.length;
        const nextWorkspaceScore = nextFileCount === 0
          ? 0
          : nextFiles.reduce((sum, f) => sum + f.composite_score, 0) / nextFileCount;
        const nextHighDebtCount = nextFiles.filter((f) => f.composite_score > 65).length;

        setAnalysisResult({
          ...analysisResult,
          files: nextFiles,
          file_count: nextFileCount,
          high_debt_count: nextHighDebtCount,
          workspace_score: nextWorkspaceScore,
        });
      } catch (_) {
        // Silently ignore - file may have been deleted
      }
    },
    [workspace, setAnalysisResult]
  );

  useEffect(() => {
    if (!workspace) return;

    let unlisten: (() => void) | null = null;
    let mounted = true;

    listen<{ path: string; event_type: string }>('file_changed', (event) => {
      if (!mounted) return;
      const { path } = event.payload;

      // Debounce: wait 800ms for rapid saves to settle
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        handleFileChanged(path);
      }, 800);
    }).then((fn) => {
      if (mounted) unlisten = fn;
      else fn();
    });

    return () => {
      mounted = false;
      if (unlisten) unlisten();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [workspace, handleFileChanged]);

  // Component renders nothing — it's a side-effect-only listener
  return null;
};
