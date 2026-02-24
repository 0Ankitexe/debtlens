import React from 'react';
import { formatScore, getScoreLabel, getComponentColor, getComponentName } from '../../lib/formatters';
import { useDebtStore } from '../../store/debtStore';

interface Props {
  x: number;
  y: number;
  node: {
    data: {
      name: string;
      path: string;
      score?: number;
      loc?: number;
    };
  };
}

const COMPONENT_KEYS = [
  'churn_rate', 'code_smell_density', 'coupling_index', 'change_coupling',
  'test_coverage_gap', 'knowledge_concentration', 'cyclomatic_complexity', 'decision_staleness',
];

const DEFAULT_WEIGHTS: Record<string, number> = {
  churn_rate: 0.22, code_smell_density: 0.20, coupling_index: 0.18,
  change_coupling: 0.12, test_coverage_gap: 0.12, knowledge_concentration: 0.08,
  cyclomatic_complexity: 0.05, decision_staleness: 0.03,
};

export const HeatmapTooltip: React.FC<Props> = ({ x, y, node }) => {
  const score = node.data.score ?? 0;
  const loc = node.data.loc ?? 0;
  const label = getScoreLabel(score);

  // Look up real component data from analysis result
  const analysisResult = useDebtStore((s) => s.analysisResult);
  const fileData = analysisResult?.files.find(
    (f) => f.relative_path === node.data.path || f.path === node.data.path,
  );
  const components = fileData?.components as Record<string, { contribution?: number; raw_score?: number; weight?: number }> | undefined;

  // Position: keep on screen
  const adjustedX = Math.min(x, window.innerWidth - 280);
  const adjustedY = Math.min(Math.max(y, 8), window.innerHeight - 260);

  return (
    <div
      className="card-glass"
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        width: 260,
        padding: '12px',
        zIndex: 200,
        pointerEvents: 'none',
        fontSize: '12px',
      }}
    >
      {/* File name */}
      <div className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px', wordBreak: 'break-all' }}>
        {node.data.name}
      </div>

      {/* Score */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Debt Score</span>
        <span style={{ fontWeight: 700, fontSize: '18px', color: scoreColor(score) }}>
          {formatScore(score)}
          <span style={{ fontSize: '11px', fontWeight: 400, marginLeft: '4px', color: 'var(--text-muted)' }}>{label}</span>
        </span>
      </div>

      {/* Component bars */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {COMPONENT_KEYS.map((key) => {
          // Use real contribution if available, otherwise approximate
          const comp = components?.[key];
          const contribution = comp?.contribution ?? score * (DEFAULT_WEIGHTS[key] ?? 0);
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: 110, fontSize: '10px', color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>
                {getComponentName(key)}
              </span>
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(contribution, 100)}%`, height: '100%', background: getComponentColor(key), borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <span className="mono" style={{ width: 26, fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right' }}>
                {contribution.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>

      {loc > 0 && (
        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', fontSize: '10px', color: 'var(--text-muted)' }}>
          {loc.toLocaleString()} lines of code
        </div>
      )}
    </div>
  );
};

function scoreColor(score: number): string {
  if (score < 40) return 'var(--debt-low)';
  if (score < 65) return 'var(--debt-medium)';
  if (score < 80) return 'var(--debt-high)';
  return 'var(--debt-critical)';
}

