import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSettingsStore } from '../settingsStore';

// Mock the tauri lib so the import chain doesn't hit @tauri-apps/api/core
vi.mock('../../lib/tauri', () => ({
    getSettings: vi.fn(async () => ({})),
    saveSettings: vi.fn(async () => ({})),
}));

describe('settingsStore', () => {
    beforeEach(() => {
        // Reset to defaults
        useSettingsStore.setState({
            gitHistoryDays: 90,
            churnNormalizationPercentile: 90,
            warningThreshold: 65,
            criticalThreshold: 80,
            busFactor: 70,
            animationsEnabled: true,
            notificationsEnabled: true,
            weights: {
                churn_rate: 0.22,
                code_smell_density: 0.20,
                coupling_index: 0.18,
                change_coupling: 0.12,
                test_coverage_gap: 0.12,
                knowledge_concentration: 0.08,
                cyclomatic_complexity: 0.05,
                decision_staleness: 0.03,
            },
        });
    });

    it('has sensible defaults', () => {
        const state = useSettingsStore.getState();
        expect(state.gitHistoryDays).toBe(90);
        expect(state.warningThreshold).toBe(65);
        expect(state.criticalThreshold).toBe(80);
    });

    it('clamps gitHistoryDays to valid range', () => {
        useSettingsStore.getState().setGitHistoryDays(3);
        expect(useSettingsStore.getState().gitHistoryDays).toBe(7);

        useSettingsStore.getState().setGitHistoryDays(500);
        expect(useSettingsStore.getState().gitHistoryDays).toBe(365);
    });

    it('clamps warningThreshold', () => {
        useSettingsStore.getState().setWarningThreshold(10);
        expect(useSettingsStore.getState().warningThreshold).toBe(30);
    });

    it('adjusts other weights when one weight changes', () => {
        const { setWeight } = useSettingsStore.getState();
        setWeight('churn_rate', 0.5);

        const weights = useSettingsStore.getState().weights;
        const total = Object.values(weights).reduce((s, v) => s + v, 0);
        // Weights should still sum to ~1.0
        expect(total).toBeCloseTo(1.0, 4);
        expect(weights.churn_rate).toBeCloseTo(0.5, 2);
    });

    it('resetWeights restores defaults', () => {
        useSettingsStore.getState().setWeight('churn_rate', 0.9);
        useSettingsStore.getState().resetWeights();

        const weights = useSettingsStore.getState().weights;
        expect(weights.churn_rate).toBeCloseTo(0.22, 2);
        expect(weights.code_smell_density).toBeCloseTo(0.20, 2);
    });

    it('toggles animations', () => {
        useSettingsStore.getState().setAnimationsEnabled(false);
        expect(useSettingsStore.getState().animationsEnabled).toBe(false);
    });
});
