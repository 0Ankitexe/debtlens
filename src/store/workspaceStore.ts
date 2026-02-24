import { create } from 'zustand';
import type { WorkspaceMeta } from '../lib/tauri';

interface WorkspaceState {
  workspace: WorkspaceMeta | null;
  isLoading: boolean;
  error: string | null;
  recentPaths: string[];
  setWorkspace: (workspace: WorkspaceMeta | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  addRecentPath: (path: string) => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspace: null,
  isLoading: false,
  error: null,
  recentPaths: loadRecentPaths(),

  setWorkspace: (workspace) => set({ workspace, error: null }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error, isLoading: false }),

  addRecentPath: (path) => {
    const { recentPaths } = get();
    const updated = [path, ...recentPaths.filter(p => p !== path)].slice(0, 5);
    set({ recentPaths: updated });
    saveRecentPaths(updated);
  },
}));

function loadRecentPaths(): string[] {
  try {
    const stored = localStorage.getItem('tde_recent_paths');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentPaths(paths: string[]): void {
  try {
    localStorage.setItem('tde_recent_paths', JSON.stringify(paths));
  } catch {
    // Ignore storage errors
  }
}
