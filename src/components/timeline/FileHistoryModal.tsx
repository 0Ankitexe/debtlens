import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Area,
    AreaChart,
} from 'recharts';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getDebtSnapshots } from '../../lib/tauri';

// ── Types ────────────────────────────────────────────────────────────────────

interface SnapshotFileSummary {
    path: string;
    score: number;
}

interface DebtSnapshotRaw {
    id: number;
    timestamp: number;
    composite_score: number;
    file_count: number;
    high_debt_count: number;
    commit_count_week: number;
    snapshot_metadata: string | null;
}

interface FileHistoryPoint {
    date: string;
    score: number;
    timestamp: number;
    snapshotId: number;
}

interface Props {
    filePath: string;           // relative or absolute path of the file to drilldown
    onClose: () => void;
}

// ── Helper: extract per-file score from snapshot metadata JSON ───────────────

function extractFileScore(
    snapshot: DebtSnapshotRaw,
    targetPath: string,
): number | null {
    if (!snapshot.snapshot_metadata) return null;
    try {
        const parsed = JSON.parse(snapshot.snapshot_metadata) as SnapshotFileSummary[];
        if (!Array.isArray(parsed)) return null;
        const entry = parsed.find(
            (f) =>
                f.path === targetPath ||
                f.path.endsWith('/' + targetPath) ||
                targetPath.endsWith('/' + f.path) ||
                f.path === targetPath.replace(/\\/g, '/'),
        );
        return entry ? entry.score : null;
    } catch {
        return null;
    }
}

// ── Score color helper ───────────────────────────────────────────────────────

function scoreColor(score: number): string {
    if (score < 40) return 'var(--debt-low)';
    if (score < 65) return 'var(--debt-medium)';
    if (score < 80) return 'var(--debt-high)';
    return 'var(--debt-critical)';
}

// ── Custom tooltip ───────────────────────────────────────────────────────────

const CustomTooltip: React.FC<{
    active?: boolean;
    payload?: Array<{ value: number }>;
    label?: string;
}> = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const score = payload[0].value;
    return (
        <div
            style={{
                background: 'rgba(17,18,28,0.95)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '12px',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
        >
            <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '18px', color: scoreColor(score), fontFamily: 'var(--font-mono)' }}>
                {score.toFixed(1)}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                {score >= 80 ? '🔴 Critical' : score >= 65 ? '🟡 High' : score >= 40 ? '🟠 Moderate' : '🟢 Low'}
            </div>
        </div>
    );
};

// ── Main Component ───────────────────────────────────────────────────────────

export const FileHistoryModal: React.FC<Props> = ({ filePath, onClose }) => {
    const workspace = useWorkspaceStore((s) => s.workspace);
    const [history, setHistory] = useState<FileHistoryPoint[]>([]);
    const [loading, setLoading] = useState(true);
    const [snapshotCount, setSnapshotCount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const fileName = filePath.split('/').pop() ?? filePath;
    const dirPart = filePath.includes('/')
        ? filePath.substring(0, filePath.lastIndexOf('/'))
        : '';

    const loadHistory = useCallback(async () => {
        if (!workspace) return;
        setLoading(true);
        setError(null);
        try {
            const snapshots = (await getDebtSnapshots(workspace.path)) as DebtSnapshotRaw[];
            setSnapshotCount(snapshots.length);

            const points: FileHistoryPoint[] = [];
            for (const snap of snapshots) {
                const score = extractFileScore(snap, filePath);
                if (score !== null) {
                    points.push({
                        date: new Date(snap.timestamp * 1000).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                        }),
                        score: Math.round(score * 10) / 10,
                        timestamp: snap.timestamp,
                        snapshotId: snap.id,
                    });
                }
            }
            setHistory(points);
        } catch (e) {
            setError(String(e));
        } finally {
            setLoading(false);
        }
    }, [workspace, filePath]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    // ── Derived stats ─────────────────────────────────────────────────────────

    const hasData = history.length >= 3;
    const latestScore = history.length > 0 ? history[history.length - 1].score : null;
    const earliestScore = history.length > 0 ? history[0].score : null;
    const peakScore = history.length > 0 ? Math.max(...history.map((h) => h.score)) : null;
    const delta =
        latestScore !== null && earliestScore !== null
            ? latestScore - earliestScore
            : null;

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <AnimatePresence>
            {/* Backdrop */}
            <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 400,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {/* Modal panel */}
                <motion.div
                    key="modal"
                    initial={{ opacity: 0, scale: 0.94, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.94, y: 12 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    onClick={(e) => e.stopPropagation()}
                    className="panel-glass"
                    style={{
                        width: '640px',
                        maxWidth: 'calc(100vw - 48px)',
                        maxHeight: 'calc(100vh - 120px)',
                        overflowY: 'auto',
                        padding: '20px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px',
                        position: 'relative',
                        zIndex: 401,
                    }}
                >
                    {/* ── Header ──────────────────────────────────────────────────── */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ minWidth: 0, flex: 1, paddingRight: '12px' }}>
                            {/* Icon + title */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                </svg>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                                    File History
                                </span>
                            </div>
                            <div className="mono" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {fileName}
                            </div>
                            {dirPart && (
                                <div className="mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {dirPart}
                                </div>
                            )}
                        </div>
                        <button
                            id="file-history-close"
                            onClick={onClose}
                            aria-label="Close file history modal"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                fontSize: '18px',
                                lineHeight: 1,
                                padding: '2px 4px',
                                borderRadius: '4px',
                                flexShrink: 0,
                                transition: 'color 0.15s',
                            }}
                            onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.color = 'var(--text-primary)')}
                            onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.color = 'var(--text-muted)')}
                        >
                            ✕
                        </button>
                    </div>

                    {/* ── Loading ──────────────────────────────────────────────────── */}
                    {loading && (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ marginBottom: '8px', display: 'block', margin: '0 auto 8px' }}>
                                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                            </svg>
                            Loading history…
                        </div>
                    )}

                    {/* ── Error ────────────────────────────────────────────────────── */}
                    {!loading && error && (
                        <div style={{ padding: '12px 16px', background: 'rgba(232,17,35,0.1)', border: '1px solid rgba(232,17,35,0.3)', borderRadius: '6px', fontSize: '12px', color: 'var(--debt-high)' }}>
                            {error}
                        </div>
                    )}

                    {/* ── Not enough snapshots ─────────────────────────────────────── */}
                    {!loading && !error && snapshotCount < 3 && (
                        <div style={{
                            padding: '32px',
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '10px',
                        }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                Not enough history yet
                            </div>
                            <div style={{ fontSize: '12px', maxWidth: '320px', lineHeight: 1.6 }}>
                                File history requires at least <strong>3 snapshots</strong>. You currently have{' '}
                                <strong>{snapshotCount}</strong>. Run analysis on separate days to build history.
                            </div>
                        </div>
                    )}

                    {/* ── File not tracked in snapshots ───────────────────────────── */}
                    {!loading && !error && snapshotCount >= 3 && !hasData && (
                        <div style={{
                            padding: '32px',
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '10px',
                        }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                            </svg>
                            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                No per-file history found
                            </div>
                            <div style={{ fontSize: '12px', maxWidth: '340px', lineHeight: 1.6 }}>
                                This file wasn't in the top-10 highest-debt files at any recorded snapshot point. Per-file history
                                is tracked for the top 10 files in each snapshot.
                            </div>
                        </div>
                    )}

                    {/* ── Chart + stats ─────────────────────────────────────────────── */}
                    {!loading && !error && hasData && (
                        <>
                            {/* Stat cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                {[
                                    {
                                        label: 'Current Score',
                                        value: latestScore !== null ? latestScore.toFixed(1) : '—',
                                        color: latestScore !== null ? scoreColor(latestScore) : 'var(--text-muted)',
                                    },
                                    {
                                        label: 'Peak Score',
                                        value: peakScore !== null ? peakScore.toFixed(1) : '—',
                                        color: peakScore !== null ? scoreColor(peakScore) : 'var(--text-muted)',
                                    },
                                    {
                                        label: delta !== null && delta > 0 ? 'Worsened by' : 'Improved by',
                                        value: delta !== null ? `${Math.abs(delta).toFixed(1)} pts` : '—',
                                        color: delta === null
                                            ? 'var(--text-muted)'
                                            : delta > 2
                                                ? 'var(--debt-high)'
                                                : delta < -2
                                                    ? 'var(--debt-low)'
                                                    : 'var(--text-secondary)',
                                    },
                                ].map(({ label, value, color }) => (
                                    <div
                                        key={label}
                                        className="card-glass"
                                        style={{ padding: '10px 12px', textAlign: 'center' }}
                                    >
                                        <div
                                            className="mono"
                                            style={{ fontSize: '20px', fontWeight: 700, color, lineHeight: 1.2 }}
                                        >
                                            {value}
                                        </div>
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '3px' }}>
                                            {label}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Trend indicator */}
                            {delta !== null && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '12px',
                                    padding: '8px 12px',
                                    background: delta > 5 ? 'rgba(232,17,35,0.07)' : delta < -5 ? 'rgba(72,187,120,0.07)' : 'rgba(255,255,255,0.03)',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-subtle)',
                                }}>
                                    <span style={{
                                        fontSize: '16px',
                                        color: delta > 2 ? 'var(--debt-high)' : delta < -2 ? 'var(--debt-low)' : 'var(--text-muted)',
                                    }}>
                                        {delta > 2 ? '↑' : delta < -2 ? '↓' : '→'}
                                    </span>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {delta > 5
                                            ? `Debt has significantly worsened (+${delta.toFixed(1)} pts) over ${history.length} snapshots`
                                            : delta < -5
                                                ? `Debt is actively improving (${delta.toFixed(1)} pts) over ${history.length} snapshots`
                                                : delta > 2
                                                    ? `Slight increase in debt (+${delta.toFixed(1)} pts) since first tracked`
                                                    : delta < -2
                                                        ? `Slight improvement in debt (${delta.toFixed(1)} pts) since first tracked`
                                                        : `Debt has remained relatively stable over ${history.length} snapshots`}
                                    </span>
                                </div>
                            )}

                            {/* Line chart */}
                            <div
                                className="card-glass"
                                style={{ padding: '16px', paddingBottom: '8px' }}
                            >
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Debt Score Over Time — {history.length} data points
                                </div>
                                <ResponsiveContainer width="100%" height={220}>
                                    <AreaChart
                                        data={history}
                                        margin={{ top: 8, right: 12, bottom: 0, left: -8 }}
                                    >
                                        <defs>
                                            <linearGradient id="fileScoreGrad" x1="0" y1="0" x2="0" y2="1">
                                                <stop
                                                    offset="5%"
                                                    stopColor={latestScore !== null ? scoreColor(latestScore) : 'var(--accent)'}
                                                    stopOpacity={0.3}
                                                />
                                                <stop
                                                    offset="95%"
                                                    stopColor={latestScore !== null ? scoreColor(latestScore) : 'var(--accent)'}
                                                    stopOpacity={0.03}
                                                />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                        <XAxis
                                            dataKey="date"
                                            tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}
                                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={[0, 100]}
                                            tick={{ fontSize: 10, fill: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}
                                            axisLine={false}
                                            tickLine={false}
                                            width={32}
                                        />
                                        <Tooltip content={<CustomTooltip />} />
                                        <ReferenceLine
                                            y={65}
                                            stroke="rgba(236,161,53,0.4)"
                                            strokeDasharray="4 4"
                                            label={{ value: 'Warn', fill: 'rgba(236,161,53,0.6)', fontSize: 9, position: 'right' }}
                                        />
                                        <ReferenceLine
                                            y={80}
                                            stroke="rgba(232,17,35,0.4)"
                                            strokeDasharray="4 4"
                                            label={{ value: 'Crit', fill: 'rgba(232,17,35,0.6)', fontSize: 9, position: 'right' }}
                                        />
                                        <Area
                                            type="monotone"
                                            dataKey="score"
                                            stroke={latestScore !== null ? scoreColor(latestScore) : 'var(--accent)'}
                                            strokeWidth={2.5}
                                            fill="url(#fileScoreGrad)"
                                            dot={{
                                                fill: latestScore !== null ? scoreColor(latestScore) : 'var(--accent)',
                                                r: 4,
                                                strokeWidth: 0,
                                            }}
                                            activeDot={{
                                                r: 6,
                                                fill: latestScore !== null ? scoreColor(latestScore) : 'var(--accent)',
                                                stroke: 'var(--bg-panel)',
                                                strokeWidth: 2,
                                            }}
                                            name="Debt Score"
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>

                            {/* Legend note */}
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '10px',
                                color: 'var(--text-muted)',
                                padding: '0 2px',
                            }}>
                                <span>Per-file data sourced from stored snapshot metadata</span>
                                <span>Press <kbd style={{ fontFamily: 'var(--font-mono)', background: 'rgba(255,255,255,0.08)', padding: '0 4px', borderRadius: '3px' }}>Esc</kbd> to close</span>
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
