import React, { useEffect, useState } from 'react';
import {
  ComposedChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getDebtSnapshots, takeSnapshot } from '../../lib/tauri';
import { useDebtStore } from '../../store/debtStore';
import { VelocityBadge } from './VelocityBadge';
import { ForecastOverlay } from './ForecastOverlay';

interface Snapshot {
  id: number;
  timestamp: number;
  composite_score: number;
  file_count: number;
  high_debt_count: number;
  commit_count_week: number;
}

export const DebtTimeline: React.FC = () => {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const analysisResult = useDebtStore((s) => s.analysisResult);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!workspace) return;
    setLoading(true);
    getDebtSnapshots(workspace.path)
      .then((data) => setSnapshots(data as Snapshot[]))
      .finally(() => setLoading(false));
  }, [workspace, analysisResult]);

  // Auto-snapshot when analysis completes
  useEffect(() => {
    if (!workspace || !analysisResult) return;

    // First snapshot: take immediately when there are no prior snapshots
    if (snapshots.length === 0) {
      takeSnapshot(workspace.path, analysisResult.workspace_score, analysisResult.file_count, analysisResult.high_debt_count, 0)
        .then((snap) => setSnapshots((prev) => [...prev, snap as Snapshot]))
        .catch(() => { });
      return;
    }

    const lastSnap = snapshots[snapshots.length - 1];
    const daysSinceLast = (Date.now() / 1000 - lastSnap.timestamp) / 86400;
    if (daysSinceLast >= 6) {
      takeSnapshot(workspace.path, analysisResult.workspace_score, analysisResult.file_count, analysisResult.high_debt_count, 0)
        .then((snap) => setSnapshots((prev) => [...prev, snap as Snapshot]))
        .catch(() => { });
    }
  }, [analysisResult, workspace, snapshots]);

  if (!workspace) {
    return <div className="empty-state" style={{ height: '100%' }}><p>Open a repository to view timeline</p></div>;
  }

  if (loading) {
    return <div className="empty-state" style={{ height: '100%' }}><p style={{ color: 'var(--text-muted)' }}>Loading snapshots…</p></div>;
  }

  if (snapshots.length === 0) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <p>No snapshots yet. Run analysis to record the first snapshot.</p>
        {analysisResult && (
          <button className="btn btn-primary" onClick={() => {
            takeSnapshot(workspace.path, analysisResult.workspace_score, analysisResult.file_count, analysisResult.high_debt_count, 0)
              .then((snap) => setSnapshots([snap as Snapshot]))
              .catch(() => { });
          }}>
            Record Snapshot Now
          </button>
        )}
      </div>
    );
  }

  // Format chart data
  const chartData = snapshots.map((s) => ({
    date: new Date(s.timestamp * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: Math.round(s.composite_score * 10) / 10,
    commits: s.commit_count_week,
    files: s.file_count,
    highDebt: s.high_debt_count,
    timestamp: s.timestamp,
  }));

  // Threshold alerts
  const alerts: Array<{ type: 'warning' | 'critical'; score: number; date: string; id: number }> = [];
  for (let i = 1; i < chartData.length; i++) {
    const prev = chartData[i - 1].score;
    const curr = chartData[i].score;
    if (prev < 65 && curr >= 65) alerts.push({ type: 'warning', score: curr, date: chartData[i].date, id: i });
    if (prev < 80 && curr >= 80) alerts.push({ type: 'critical', score: curr, date: chartData[i].date, id: i });
  }

  const activeAlerts = alerts.filter((a) => !dismissedAlerts.has(a.id));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Debt Timeline</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
            {snapshots.length} snapshots · {Math.round((snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp) / 86400)} days tracked
          </p>
        </div>
        <VelocityBadge snapshots={snapshots} />
      </div>

      {/* Threshold alerts */}
      {activeAlerts.map((alert) => (
        <div key={alert.id} style={{
          padding: '10px 14px',
          borderRadius: '6px',
          background: alert.type === 'critical' ? 'rgba(232,17,35,0.12)' : 'rgba(236,161,53,0.12)',
          border: `1px solid ${alert.type === 'critical' ? 'rgba(232,17,35,0.4)' : 'rgba(236,161,53,0.4)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
        }}>
          <span>
            <span style={{ fontSize: '14px', marginRight: '6px' }}>{alert.type === 'critical' ? '🔴' : '⚠️'}</span>
            Debt score crossed {alert.type === 'critical' ? 'critical' : 'warning'} threshold ({alert.type === 'critical' ? '80' : '65'}) on {alert.date} — reached {alert.score.toFixed(1)}
          </span>
          <button onClick={() => setDismissedAlerts((d) => new Set([...d, alert.id]))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}>✕</button>
        </div>
      ))}

      {/* Main chart */}
      <div className="card-glass" style={{ padding: '16px', flex: '1 0 300px' }}>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} />
            <YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} label={{ value: 'Debt', angle: -90, position: 'insideLeft', fill: 'var(--text-muted)', fontSize: 10 }} />
            <YAxis yAxisId="commits" orientation="right" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} label={{ value: 'Commits', angle: 90, position: 'insideRight', fill: 'var(--text-muted)', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: 'var(--surface-glass)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '12px' }}
              labelStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', color: 'var(--text-muted)' }} />
            <ReferenceLine yAxisId="score" y={65} stroke="rgba(236,161,53,0.5)" strokeDasharray="4 4" label={{ value: 'Warning', fill: 'rgba(236,161,53,0.7)', fontSize: 9 }} />
            <ReferenceLine yAxisId="score" y={80} stroke="rgba(232,17,35,0.5)" strokeDasharray="4 4" label={{ value: 'Critical', fill: 'rgba(232,17,35,0.7)', fontSize: 9 }} />
            <Bar yAxisId="commits" dataKey="commits" fill="rgba(99,179,237,0.2)" name="Commits/Week" />
            <Area yAxisId="score" type="monotone" dataKey="score" stroke="var(--accent)" fill="rgba(99,179,237,0.15)" strokeWidth={2} name="Debt Score" dot={{ fill: 'var(--accent)', r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Forecast */}
      <ForecastOverlay snapshots={snapshots} />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {[
          { label: 'Current Score', value: chartData[chartData.length - 1]?.score.toFixed(1) ?? '—' },
          { label: 'Peak Score', value: Math.max(...chartData.map((d) => d.score)).toFixed(1) },
          { label: 'Improvement', value: ((chartData[0]?.score ?? 0) - (chartData[chartData.length - 1]?.score ?? 0)).toFixed(1) + ' pts' },
        ].map(({ label, value }) => (
          <div key={label} className="card-glass" style={{ padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>{value}</div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
