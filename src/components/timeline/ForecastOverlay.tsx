import React from 'react';

interface Snapshot {
  timestamp: number;
  composite_score: number;
}

interface Props {
  snapshots: Snapshot[];
}

function regression(points: [number, number][]): { slope: number; intercept: number } {
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

export const ForecastOverlay: React.FC<Props> = ({ snapshots }) => {
  const recent = snapshots.slice(-8);
  if (recent.length < 3) {
    return (
      <div style={{ padding: '10px 14px', fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
        Need at least 3 snapshots for forecast projection
      </div>
    );
  }

  const points: [number, number][] = recent.map((s, i) => [i, s.composite_score]);
  const { slope, intercept } = regression(points);
  const n = recent.length;

  // Project 4 weeks forward
  const forecasts = [1, 2, 3, 4].map((w) => ({
    week: w,
    score: Math.max(0, Math.min(100, slope * (n - 1 + w) + intercept)),
  }));

  const currentScore = recent[recent.length - 1].composite_score;
  const score4w = forecasts[3].score;
  const crosses65 = currentScore < 65 && score4w >= 65;
  const crosses80 = currentScore < 80 && score4w >= 80;
  const improves = score4w < currentScore - 2;

  const summary = crosses80
    ? `⚠️ At this rate, your score will reach critical threshold (80) within 4 weeks`
    : crosses65
    ? `⚠️ Your score is trending toward the warning threshold (65) within 4 weeks`
    : improves
    ? `✅ On track to improve by ${(currentScore - score4w).toFixed(1)} pts over the next 4 weeks`
    : `→ Score projected to remain stable around ${score4w.toFixed(1)} over 4 weeks`;

  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: '6px',
      background: crosses80 ? 'rgba(232,17,35,0.07)' : crosses65 ? 'rgba(236,161,53,0.07)' : 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border-subtle)',
      fontSize: '12px',
    }}>
      <div style={{ fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>4-Week Forecast</div>
      <div style={{ color: crosses80 ? 'var(--debt-critical)' : crosses65 ? 'var(--debt-high)' : 'var(--text-secondary)', marginBottom: '10px' }}>
        {summary}
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        {forecasts.map(({ week, score }) => (
          <div key={week} style={{ flex: 1, textAlign: 'center', padding: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', border: '1px dashed var(--border-subtle)' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>+{week}w</div>
            <div className="mono" style={{ fontSize: '14px', fontWeight: 600, color: score >= 80 ? 'var(--debt-critical)' : score >= 65 ? 'var(--debt-high)' : 'var(--debt-low)' }}>
              {score.toFixed(0)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
