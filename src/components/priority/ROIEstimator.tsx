import React from 'react';
import { formatEffort } from '../../lib/formatters';

interface FileScore {
  relative_path: string;
  composite_score: number;
  loc: number;
  components: Record<string, { raw_score: number; weight: number; contribution: number; details?: string[] }>;
}

interface Props {
  files: FileScore[];
}

function estimateEffort(file: FileScore): { low: number; high: number; reduction: number } {
  const smells = parseFloat(
    file.components?.code_smell_density?.details?.[0]?.match(/^(\d+)/)?.[1] ?? '0'
  ) || 0;
  const coupling = file.components?.coupling_index?.raw_score ?? 0;
  const base = smells * 0.5 + file.loc / 200 + coupling / 20;
  return {
    low: Math.max(1, Math.round(base * 0.6)),
    high: Math.round(base * 1.4) + 1,
    reduction: Math.round(file.composite_score * 0.4),
  };
}

export const ROIEstimator: React.FC<Props> = ({ files }) => {
  if (files.length === 0) return null;

  const estimates = files.map((f) => ({ file: f, ...estimateEffort(f) }));
  const totalLow = estimates.reduce((s, e) => s + e.low, 0);
  const totalHigh = estimates.reduce((s, e) => s + e.high, 0);
  const avgReduction = Math.round(estimates.reduce((s, e) => s + e.reduction, 0) / estimates.length);

  return (
    <div className="card-glass" style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600 }}>ROI Estimator — Top {files.length} Files</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Projected effort and debt reduction</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--debt-low)' }}>
            −{avgReduction}pts
          </div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>avg score reduction</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
        {estimates.map(({ file, low, high }) => (
          <div key={file.relative_path} style={{ padding: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            <div className="mono" style={{ fontSize: '10px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '4px' }}>
              {file.relative_path.split('/').pop()}
            </div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
              {formatEffort(low, high)}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              score: {Math.round(file.composite_score)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>Total estimated effort:</span>
        <span className="mono" style={{ color: 'var(--text-secondary)' }}>{totalLow}–{totalHigh} dev-hours</span>
      </div>
    </div>
  );
};
