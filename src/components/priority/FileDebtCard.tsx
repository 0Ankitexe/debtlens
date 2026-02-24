import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getComponentName, getComponentColor, formatScore } from '../../lib/formatters';
import { getSuggestedActions } from '../../lib/scoring';
import { ScoreRing } from './ScoreRing';
import { FileHistoryModal } from '../timeline/FileHistoryModal';

interface FileScore {
  path: string;
  relative_path: string;
  composite_score: number;
  loc: number;
  language: string;
  components: Record<string, { raw_score: number; weight: number; contribution: number }>;
}

interface Props {
  file: FileScore;
  rank: number;
  supervised?: boolean;
  onMarkAcceptable: (path: string) => void;
  onViewHistory?: (path: string) => void;
}

export const FileDebtCard: React.FC<Props> = ({ file, rank, supervised, onMarkAcceptable, onViewHistory }) => {
  const [expanded, setExpanded] = useState(false);
  const [historyPath, setHistoryPath] = useState<string | null>(null);

  const score = file.composite_score;
  const comps = file.components ?? {};

  // Top 3 drivers by contribution
  const topDrivers = Object.entries(comps)
    .map(([key, val]) => ({ key, ...val }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 3);

  const actions = getSuggestedActions(comps);
  const tags = [file.language, `${file.loc} LOC`].filter(Boolean);

  const borderColor = score >= 80 ? 'var(--debt-critical)' : score >= 65 ? 'var(--debt-high)' : score >= 40 ? 'var(--debt-medium)' : 'var(--debt-low)';

  return (
    <motion.div
      layout
      className="card-glass"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        opacity: supervised ? 0.6 : 1,
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px', cursor: 'pointer' }}
        onClick={() => setExpanded((e) => !e)}
      >
        {/* Rank */}
        {rank > 0 && (
          <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-muted)', minWidth: '24px', textAlign: 'center', lineHeight: '20px' }}>
            {rank}
          </div>
        )}

        {/* Ring + info */}
        <ScoreRing components={comps} size={52} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="mono" style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file.relative_path}
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
            {tags.map((t) => (
              <span key={t} style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '1px 6px', borderRadius: '3px' }}>{t}</span>
            ))}
            {supervised && <span style={{ fontSize: '10px', color: 'var(--accent)', background: 'rgba(99,179,237,0.1)', padding: '1px 6px', borderRadius: '3px' }}>Supervised</span>}
          </div>
          {/* Top drivers */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            {topDrivers.map((d) => (
              <span key={d.key} style={{ fontSize: '10px', color: getComponentColor(d.key), display: 'flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: getComponentColor(d.key), display: 'inline-block' }} />
                {getComponentName(d.key)} {d.contribution.toFixed(0)}pts
              </span>
            ))}
          </div>
        </div>

        {/* Score */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: borderColor }}>{formatScore(score)}</div>
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {expanded ? '▲' : '▼'} details
          </div>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', borderTop: '1px solid var(--border-subtle)' }}
          >
            <div style={{ padding: '12px' }}>
              {/* Suggested actions */}
              {actions.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>SUGGESTED ACTIONS</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {actions.map((action, i) => (
                      <div key={i} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--accent)', flexShrink: 0 }}>→</span>
                        <span>{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* View history button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const path = file.relative_path;
                  if (onViewHistory) onViewHistory(path);
                  else setHistoryPath(path);
                }}
                className="btn"
                style={{ fontSize: '11px', padding: '4px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                📈 View History
              </button>

              {/* Mark acceptable */}
              {!supervised && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMarkAcceptable(file.relative_path); }}
                  className="btn"
                  style={{ fontSize: '11px', padding: '4px 10px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  Mark as Acceptable
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File history modal (local) */}
      {historyPath && (
        <FileHistoryModal filePath={historyPath} onClose={() => setHistoryPath(null)} />
      )}
    </motion.div>
  );
};
