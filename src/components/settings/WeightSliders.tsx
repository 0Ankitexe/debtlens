import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import type { ScoreWeights } from '../../store/settingsStore';
import { getComponentColor, getComponentName } from '../../lib/formatters';

const WEIGHT_KEYS: (keyof ScoreWeights)[] = [
  'churn_rate', 'code_smell_density', 'coupling_index', 'change_coupling',
  'test_coverage_gap', 'knowledge_concentration', 'cyclomatic_complexity', 'decision_staleness',
];

export const WeightSliders: React.FC = () => {
  const weights = useSettingsStore((s) => s.weights);
  const setWeight = useSettingsStore((s) => s.setWeight);
  const resetWeights = useSettingsStore((s) => s.resetWeights);

  const total = Object.values(weights).reduce((s, v) => s + v, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '13px' }}>Score Weights</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Adjust how each component contributes to the composite score. Sum auto-balances to 100%.
          </div>
        </div>
        <button onClick={resetWeights}
          style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
          Reset to Defaults
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {WEIGHT_KEYS.map((key) => {
          const pct = (weights[key] / total * 100);
          const color = getComponentColor(key);
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: color }} />
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{getComponentName(key)}</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '38px', textAlign: 'right' }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="range" min="0" max="0.5" step="0.01"
                  value={weights[key]}
                  onChange={(e) => setWeight(key, parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Visual weight bar */}
      <div style={{ marginTop: '16px', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
        {WEIGHT_KEYS.map((key) => (
          <div key={key} style={{ width: `${(weights[key] / total * 100)}%`, background: getComponentColor(key), transition: 'width 0.3s' }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>0%</span>
        <span style={{ fontSize: '10px', color: Math.abs(total - 1) < 0.01 ? 'var(--debt-low)' : 'var(--debt-high)' }}>
          Total: {(total * 100).toFixed(1)}%
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>100%</span>
      </div>
    </div>
  );
};
