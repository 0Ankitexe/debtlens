import { create } from 'zustand';
import type { AnalysisResult, FileScore, HeatmapNode } from '../lib/tauri';

interface DebtState {
  analysisResult: AnalysisResult | null;
  heatmapData: HeatmapNode | null;
  isAnalyzing: boolean;
  analysisProgress: { current: number; total: number; currentFile: string } | null;
  selectedFile: FileScore | null;
  activeView: 'heatmap' | 'fixfirst' | 'timeline' | 'register' | 'budget' | 'settings';

  setAnalysisResult: (result: AnalysisResult | null) => void;
  setHeatmapData: (data: HeatmapNode | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setAnalysisProgress: (progress: { current: number; total: number; currentFile: string } | null) => void;
  setSelectedFile: (file: FileScore | null) => void;
  setActiveView: (view: DebtState['activeView']) => void;
}

export const useDebtStore = create<DebtState>((set) => ({
  analysisResult: null,
  heatmapData: null,
  isAnalyzing: false,
  analysisProgress: null,
  selectedFile: null,
  activeView: 'heatmap',

  setAnalysisResult: (result) => set({ analysisResult: result }),
  setHeatmapData: (data) => set({ heatmapData: data }),
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),
  setSelectedFile: (file) => set({ selectedFile: file }),
  setActiveView: (view) => set({ activeView: view }),
}));
