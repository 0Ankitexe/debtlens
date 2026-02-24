import { describe, it, expect } from 'vitest';
import {
    formatScore,
    getScoreClass,
    getScoreLabel,
    formatEffortRange,
    formatLOC,
    formatComponentName,
    getComponentColor,
    getComponentName,
    formatEffort,
} from '../formatters';

describe('formatScore', () => {
    it('formats to 1 decimal place', () => {
        expect(formatScore(42.567)).toBe('42.6');
        expect(formatScore(0)).toBe('0.0');
        expect(formatScore(100)).toBe('100.0');
    });
});

describe('getScoreClass', () => {
    it('returns correct severity class', () => {
        expect(getScoreClass(10)).toBe('low');
        expect(getScoreClass(50)).toBe('medium');
        expect(getScoreClass(70)).toBe('high');
        expect(getScoreClass(90)).toBe('critical');
    });

    it('handles boundary values', () => {
        expect(getScoreClass(35)).toBe('medium');
        expect(getScoreClass(65)).toBe('high');
        expect(getScoreClass(80)).toBe('critical');
    });
});

describe('getScoreLabel', () => {
    it('returns human-readable labels', () => {
        expect(getScoreLabel(20)).toBe('Low Debt');
        expect(getScoreLabel(50)).toBe('Moderate Debt');
        expect(getScoreLabel(70)).toBe('High Debt');
        expect(getScoreLabel(90)).toBe('Critical Debt');
    });
});

describe('formatEffortRange', () => {
    it('formats hour ranges with ±40%', () => {
        expect(formatEffortRange(10)).toBe('6–14 hours');
    });

    it('handles small values', () => {
        expect(formatEffortRange(0.5)).toBe('< 1 hour');
    });
});

describe('formatLOC', () => {
    it('formats large values with k suffix', () => {
        expect(formatLOC(1500)).toBe('1.5k');
        expect(formatLOC(10000)).toBe('10.0k');
    });

    it('formats small values as-is', () => {
        expect(formatLOC(500)).toBe('500');
    });
});

describe('formatComponentName', () => {
    it('converts snake_case to Title Case', () => {
        expect(formatComponentName('churn_rate')).toBe('Churn Rate');
        expect(formatComponentName('code_smell_density')).toBe('Code Smell Density');
    });
});

describe('getComponentColor', () => {
    it('returns CSS variable for known components', () => {
        expect(getComponentColor('churn_rate')).toBe('var(--color-churn)');
        expect(getComponentColor('coupling_index')).toBe('var(--color-coupling)');
    });

    it('returns accent fallback for unknown keys', () => {
        expect(getComponentColor('unknown_thing')).toBe('var(--accent)');
    });
});

describe('getComponentName', () => {
    it('returns friendly names for known components', () => {
        expect(getComponentName('churn_rate')).toBe('Churn Rate');
        expect(getComponentName('code_smell_density')).toBe('Code Smells');
    });

    it('falls back to formatted name for unknown', () => {
        expect(getComponentName('some_new_metric')).toBe('Some New Metric');
    });
});

describe('formatEffort', () => {
    it('formats ranges', () => {
        expect(formatEffort(2, 4)).toBe('2–4h');
    });

    it('handles tiny values', () => {
        expect(formatEffort(0, 1)).toBe('< 1h');
    });

    it('handles equal values', () => {
        expect(formatEffort(3, 3)).toBe('~3h');
    });
});
