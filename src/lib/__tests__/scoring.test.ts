import { describe, it, expect } from 'vitest';
import { computeCompositeScore, getSuggestedActions, computeROIEstimate } from '../scoring';
import type { ScoreWeights } from '../../store/settingsStore';

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

function makeComponents(overrides: Record<string, number> = {}) {
    const keys = Object.keys(DEFAULT_WEIGHTS);
    const components: Record<string, { raw_score: number }> = {};
    for (const key of keys) {
        components[key] = { raw_score: overrides[key] ?? 0 };
    }
    return components;
}

describe('computeCompositeScore', () => {
    it('returns 0 when all raw scores are 0', () => {
        expect(computeCompositeScore(makeComponents(), DEFAULT_WEIGHTS)).toBe(0);
    });

    it('returns weighted sum of components', () => {
        const components = makeComponents({ churn_rate: 100 });
        const score = computeCompositeScore(components, DEFAULT_WEIGHTS);
        expect(score).toBeCloseTo(22.0, 2);
    });

    it('returns 100 when all raw scores are 100', () => {
        const all100 = makeComponents(
            Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, 100])),
        );
        const score = computeCompositeScore(all100, DEFAULT_WEIGHTS);
        // Weights sum to 1.0, so all-100 = 100
        expect(score).toBeCloseTo(100.0, 2);
    });
});

describe('getSuggestedActions', () => {
    it('returns "good shape" when all scores are low', () => {
        const actions = getSuggestedActions(makeComponents());
        expect(actions).toHaveLength(1);
        expect(actions[0]).toContain('good shape');
    });

    it('suggests smell fix when code_smell_density is high', () => {
        const components = makeComponents({ code_smell_density: 80 });
        const actions = getSuggestedActions(components);
        expect(actions.some((a) => a.toLowerCase().includes('smell'))).toBe(true);
    });

    it('suggests stabilization when churn is high', () => {
        const components = makeComponents({ churn_rate: 80 });
        const actions = getSuggestedActions(components);
        expect(actions.some((a) => a.toLowerCase().includes('stabilize'))).toBe(true);
    });

    it('suggests tests when coverage gap is high', () => {
        const components = makeComponents({ test_coverage_gap: 80 });
        const actions = getSuggestedActions(components);
        expect(actions.some((a) => a.toLowerCase().includes('test'))).toBe(true);
    });
});

describe('computeROIEstimate', () => {
    it('computes based on formula', () => {
        // smellCount * 0.5 + loc / 200 + couplingScore / 20
        const roi = computeROIEstimate(10, 400, 60);
        expect(roi).toBeCloseTo(5 + 2 + 3, 6); // = 10
    });

    it('returns 0 for clean file', () => {
        expect(computeROIEstimate(0, 0, 0)).toBe(0);
    });
});
