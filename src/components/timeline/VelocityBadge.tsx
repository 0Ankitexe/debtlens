import React from 'react';

interface Snapshot {
  timestamp: number;
  composite_score: number;
}

interface Props {
  snapshots: Snapshot[];
}

function linearRegression(points: [number, number][]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.[1] ?? 0 };
  const sumX = points.reduce((s, p) => s + p[0], 0);
  const sumY = points.reduce((s, p) => s + p[1], 0);
  const sumXY = points.reduce((s, p) => s + p[0] * p[1], 0);
  const sumXX = points.reduce((s, p) => s + p[0] * p[0], 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export const VelocityBadge: React.FC<Props> = ({ snapshots }) => {
  const recent = snapshots.slice(-8);
  if (recent.length < 2) return null;

  // Regression over week indices
  const points: [number, number][] = recent.map((s, i) => [i, s.composite_score]);
  const { slope } = linearRegression(points);
  const ptsPerWeek = slope; // each index step ≈ 1 week (snapshots are weekly)

  const direction = ptsPerWeek > 0.5 ? 'up' : ptsPerWeek < -0.5 ? 'down' : 'flat';
  const color = direction === 'up' ? 'var(--debt-critical)' : direction === 'down' ? 'var(--debt-low)' : 'var(--text-muted)';
  const icon = direction === 'up' ? '↑' : direction === 'down' ? '↓' : '→';
  const label = direction === 'up' ? 'Increasing' : direction === 'down' ? 'Improving' : 'Stable';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      background: 'rgba(255,255,255,0.05)',
      borderRadius: '20px',
      border: `1px solid ${color}40`,
      fontSize: '12px',
    }}>
      <span style={{ fontSize: '16px', color }}>{icon}</span>
      <span className="mono" style={{ fontWeight: 600, color }}>{Math.abs(ptsPerWeek).toFixed(1)} pts/wk</span>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
};
