import { create } from 'zustand';
import { getSettings, saveSettings, type AppSettings } from '../lib/tauri';

export interface ScoreWeights {
  churn_rate: number;
  code_smell_density: number;
  coupling_index: number;
  change_coupling: number;
  test_coverage_gap: number;
  knowledge_concentration: number;
  cyclomatic_complexity: number;
  decision_staleness: number;
}

export interface SettingsState {
  schema_version: number;
  gitHistoryDays: number;
  churnNormalizationPercentile: number;
  weights: ScoreWeights;
  warningThreshold: number;
  criticalThreshold: number;
  busFactor: number;
  colorScheme: AppSettings['colorScheme'];
  nodeLabel: AppSettings['nodeLabel'];
  animationsEnabled: boolean;
  snapshotSchedule: AppSettings['snapshotSchedule'];
  snapshotRetention: number;
  notificationsEnabled: boolean;
  isHydrated: boolean;
  hydrateFromWorkspace: (workspacePath: string) => Promise<void>;
  persistToWorkspace: (workspacePath: string) => Promise<void>;
  setWeight: (key: keyof ScoreWeights, value: number) => void;
  setGitHistoryDays: (days: number) => void;
  setChurnNormalizationPercentile: (percentile: number) => void;
  setWarningThreshold: (threshold: number) => void;
  setCriticalThreshold: (threshold: number) => void;
  setBusFactor: (value: number) => void;
  setColorScheme: (scheme: AppSettings['colorScheme']) => void;
  setNodeLabel: (mode: AppSettings['nodeLabel']) => void;
  setAnimationsEnabled: (enabled: boolean) => void;
  setSnapshotSchedule: (schedule: AppSettings['snapshotSchedule']) => void;
  setSnapshotRetention: (retention: number) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  resetWeights: () => void;
}

type PersistedSettingsFields = {
  schema_version: number;
  gitHistoryDays: number;
  churnNormalizationPercentile: number;
  weights: ScoreWeights;
  warningThreshold: number;
  criticalThreshold: number;
  busFactor: number;
  colorScheme: AppSettings['colorScheme'];
  nodeLabel: AppSettings['nodeLabel'];
  animationsEnabled: boolean;
  snapshotSchedule: AppSettings['snapshotSchedule'];
  snapshotRetention: number;
  notificationsEnabled: boolean;
};

const DEFAULT_WEIGHTS: ScoreWeights = {
  churn_rate: 0.22,
  code_smell_density: 0.20,
  coupling_index: 0.18,
  change_coupling: 0.12,
  test_coverage_gap: 0.12,
  knowledge_concentration: 0.08,
  cyclomatic_complexity: 0.05,
  decision_staleness: 0.03,
};

const DEFAULT_SETTINGS: AppSettings = {
  schema_version: 2,
  gitHistoryDays: 90,
  churnNormalizationPercentile: 90,
  weights: { ...DEFAULT_WEIGHTS },
  warningThreshold: 65,
  criticalThreshold: 80,
  busFactor: 70,
  colorScheme: 'default',
  nodeLabel: 'always',
  animationsEnabled: true,
  snapshotSchedule: 'weekly',
  snapshotRetention: 52,
  notificationsEnabled: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const clamped: ScoreWeights = {
    churn_rate: clamp(weights.churn_rate, 0, 1),
    code_smell_density: clamp(weights.code_smell_density, 0, 1),
    coupling_index: clamp(weights.coupling_index, 0, 1),
    change_coupling: clamp(weights.change_coupling, 0, 1),
    test_coverage_gap: clamp(weights.test_coverage_gap, 0, 1),
    knowledge_concentration: clamp(weights.knowledge_concentration, 0, 1),
    cyclomatic_complexity: clamp(weights.cyclomatic_complexity, 0, 1),
    decision_staleness: clamp(weights.decision_staleness, 0, 1),
  };

  const total = Object.values(clamped).reduce((sum, value) => sum + value, 0);
  if (total <= Number.EPSILON) {
    return { ...DEFAULT_WEIGHTS };
  }

  return {
    churn_rate: clamped.churn_rate / total,
    code_smell_density: clamped.code_smell_density / total,
    coupling_index: clamped.coupling_index / total,
    change_coupling: clamped.change_coupling / total,
    test_coverage_gap: clamped.test_coverage_gap / total,
    knowledge_concentration: clamped.knowledge_concentration / total,
    cyclomatic_complexity: clamped.cyclomatic_complexity / total,
    decision_staleness: clamped.decision_staleness / total,
  };
}

function toScoreWeights(weights: Record<string, number>): ScoreWeights {
  return normalizeWeights({
    churn_rate: weights.churn_rate ?? DEFAULT_WEIGHTS.churn_rate,
    code_smell_density: weights.code_smell_density ?? DEFAULT_WEIGHTS.code_smell_density,
    coupling_index: weights.coupling_index ?? DEFAULT_WEIGHTS.coupling_index,
    change_coupling: weights.change_coupling ?? DEFAULT_WEIGHTS.change_coupling,
    test_coverage_gap: weights.test_coverage_gap ?? DEFAULT_WEIGHTS.test_coverage_gap,
    knowledge_concentration:
      weights.knowledge_concentration ?? DEFAULT_WEIGHTS.knowledge_concentration,
    cyclomatic_complexity:
      weights.cyclomatic_complexity ?? DEFAULT_WEIGHTS.cyclomatic_complexity,
    decision_staleness: weights.decision_staleness ?? DEFAULT_WEIGHTS.decision_staleness,
  });
}

function fromAppSettings(settings: AppSettings): PersistedSettingsFields {
  return {
    schema_version: settings.schema_version,
    gitHistoryDays: clamp(settings.gitHistoryDays, 7, 365),
    churnNormalizationPercentile: clamp(settings.churnNormalizationPercentile, 50, 99),
    weights: toScoreWeights(settings.weights),
    warningThreshold: clamp(settings.warningThreshold, 30, 90),
    criticalThreshold: clamp(settings.criticalThreshold, 50, 100),
    busFactor: clamp(settings.busFactor, 50, 95),
    colorScheme: settings.colorScheme,
    nodeLabel: settings.nodeLabel,
    animationsEnabled: settings.animationsEnabled,
    snapshotSchedule: settings.snapshotSchedule,
    snapshotRetention: clamp(settings.snapshotRetention, 10, 260),
    notificationsEnabled: settings.notificationsEnabled,
  };
}

function toAppSettings(state: SettingsState): AppSettings {
  return {
    schema_version: state.schema_version,
    gitHistoryDays: state.gitHistoryDays,
    churnNormalizationPercentile: state.churnNormalizationPercentile,
    weights: { ...normalizeWeights(state.weights) },
    warningThreshold: state.warningThreshold,
    criticalThreshold: state.criticalThreshold,
    busFactor: state.busFactor,
    colorScheme: state.colorScheme,
    nodeLabel: state.nodeLabel,
    animationsEnabled: state.animationsEnabled,
    snapshotSchedule: state.snapshotSchedule,
    snapshotRetention: state.snapshotRetention,
    notificationsEnabled: state.notificationsEnabled,
  };
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...fromAppSettings(DEFAULT_SETTINGS),
  isHydrated: false,

  hydrateFromWorkspace: async (workspacePath) => {
    set({ isHydrated: false });
    const settings = await getSettings(workspacePath);
    set({
      ...fromAppSettings(settings),
      isHydrated: true,
    });
  },

  persistToWorkspace: async (workspacePath) => {
    const payload = toAppSettings(get());
    const saved = await saveSettings(workspacePath, payload);
    set({
      ...fromAppSettings(saved),
      isHydrated: true,
    });
  },

  setWeight: (key, value) =>
    set((state) => {
      const weights = { ...state.weights };
      const nextValue = clamp(value, 0, 1);
      const oldValue = weights[key];
      const delta = nextValue - oldValue;

      const otherKeys = (Object.keys(weights) as (keyof ScoreWeights)[]).filter((k) => k !== key);
      const otherSum = otherKeys.reduce((sum, k) => sum + weights[k], 0);

      const nextWeights = { ...weights, [key]: nextValue };
      for (const otherKey of otherKeys) {
        const proportion = otherSum > 0 ? weights[otherKey] / otherSum : 1 / otherKeys.length;
        nextWeights[otherKey] = Math.max(0, weights[otherKey] - delta * proportion);
      }

      return { weights: normalizeWeights(nextWeights) };
    }),

  setGitHistoryDays: (days) => set({ gitHistoryDays: clamp(days, 7, 365) }),
  setChurnNormalizationPercentile: (percentile) =>
    set({ churnNormalizationPercentile: clamp(percentile, 50, 99) }),
  setWarningThreshold: (threshold) => set({ warningThreshold: clamp(threshold, 30, 90) }),
  setCriticalThreshold: (threshold) => set({ criticalThreshold: clamp(threshold, 50, 100) }),
  setBusFactor: (value) => set({ busFactor: clamp(value, 50, 95) }),
  setColorScheme: (scheme) => set({ colorScheme: scheme }),
  setNodeLabel: (mode) => set({ nodeLabel: mode }),
  setAnimationsEnabled: (enabled) => set({ animationsEnabled: enabled }),
  setSnapshotSchedule: (schedule) => set({ snapshotSchedule: schedule }),
  setSnapshotRetention: (retention) => set({ snapshotRetention: clamp(retention, 10, 260) }),
  setNotificationsEnabled: (enabled) => set({ notificationsEnabled: enabled }),
  resetWeights: () => set({ weights: { ...DEFAULT_WEIGHTS } }),
}));
