import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getFileBreakdown } from '../../lib/tauri';
import { getComponentName, getComponentColor, formatScore, getScoreLabel } from '../../lib/formatters';

interface ComponentDetail {
  name: string;
  raw_score: number;
  weight: number;
  contribution: number;
  details: string[];
}

interface FileBreakdown {
  path: string;
  composite_score: number;
  components: ComponentDetail[];
}

interface Props {
  path: string;
  onClose: () => void;
}

export const ScoreBreakdown: React.FC<Props> = ({ path, onClose }) => {
  const [breakdown, setBreakdown] = useState<FileBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getFileBreakdown(path)
      .then(setBreakdown)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [path]);

  const sorted = breakdown?.components.slice().sort((a, b) => b.contribution - a.contribution) ?? [];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="panel-glass"
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 340,
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderLeft: '1px solid var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {path}
            </div>
            {breakdown && (
              <div style={{ fontSize: '22px', fontWeight: 700, color: scoreColor(breakdown.composite_score), marginTop: '2px' }}>
                {formatScore(breakdown.composite_score)}
                <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>
                  {getScoreLabel(breakdown.composite_score)}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {loading && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading breakdown…</p>}
          {error && <p style={{ color: 'var(--debt-critical)', fontSize: '13px' }}>{error}</p>}

          {!loading && !error && breakdown && (
            <>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                Score components — sorted by impact
              </p>

              {sorted.map((comp) => (
                <div key={comp.name} style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {getComponentName(comp.name)}
                    </span>
                    <span className="mono" style={{ fontSize: '12px', color: getComponentColor(comp.name) }}>
                      {comp.raw_score.toFixed(0)}
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                        ×{(comp.weight * 100).toFixed(0)}%
                      </span>
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: '4px' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(comp.raw_score, 100)}%` }}
                      transition={{ duration: 0.5, delay: 0.1 }}
                      style={{ height: '100%', background: getComponentColor(comp.name), borderRadius: 3 }}
                    />
                  </div>

                  {/* Contribution */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span>Contributes {comp.contribution.toFixed(1)} pts to score</span>
                  </div>

                  {/* Details */}
                  {comp.details.length > 0 && (
                    <div style={{ marginTop: '4px', padding: '4px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', fontSize: '10px', color: 'var(--text-secondary)' }}>
                      {comp.details.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

function scoreColor(score: number): string {
  if (score < 40) return 'var(--debt-low)';
  if (score < 65) return 'var(--debt-medium)';
  if (score < 80) return 'var(--debt-high)';
  return 'var(--debt-critical)';
}
