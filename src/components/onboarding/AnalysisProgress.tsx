import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDebtStore } from '../../store/debtStore';

export const AnalysisProgress: React.FC = () => {
  const isAnalyzing = useDebtStore((s) => s.isAnalyzing);
  const progress = useDebtStore((s) => s.analysisProgress);

  return (
    <AnimatePresence>
      {isAnalyzing && progress && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="card-glass"
            style={{
              padding: '32px 48px',
              textAlign: 'center',
              minWidth: '400px',
              maxWidth: '500px',
            }}
          >
            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="1.5"
                style={{ marginBottom: '12px' }}
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 4px 0' }}>
                Analyzing Repository
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Scanning files and computing debt scores
              </p>
            </div>

            {/* Progress bar */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span className="mono" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {progress.current} / {progress.total}
                </span>
                <span className="mono" style={{ fontSize: '12px', color: 'var(--accent)' }}>
                  {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="progress-bar" style={{ height: '6px', borderRadius: '3px' }}>
                <motion.div
                  className="progress-bar-fill"
                  style={{ borderRadius: '3px' }}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
                  }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
            </div>

            {/* Current file */}
            <div
              style={{
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span
                className="mono"
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {shortenPath(progress.currentFile)}
              </span>
            </div>

            {/* Phase indicators */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '20px' }}>
              <PhaseStep label="Git History" active={progress.current <= 1} done={progress.current > 1} />
              <PhaseStep
                label="AST Analysis"
                active={progress.current > 1 && progress.current < progress.total * 0.8}
                done={progress.current >= progress.total * 0.8}
              />
              <PhaseStep
                label="Scoring"
                active={progress.current >= progress.total * 0.8 && progress.current < progress.total}
                done={progress.current >= progress.total}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const PhaseStep: React.FC<{ label: string; active: boolean; done: boolean }> = ({
  label,
  active,
  done,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '11px',
      color: done ? 'var(--debt-low)' : active ? 'var(--accent)' : 'var(--text-muted)',
    }}
  >
    <span style={{ fontSize: '14px' }}>
      {done ? '✓' : active ? '⟳' : '○'}
    </span>
    <span>{label}</span>
  </div>
);

function shortenPath(fullPath: string): string {
  const parts = fullPath.split('/');
  if (parts.length <= 3) return fullPath;
  return `…/${parts.slice(-3).join('/')}`;
}
