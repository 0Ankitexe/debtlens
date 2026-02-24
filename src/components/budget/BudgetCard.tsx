import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface BudgetWithStats {
  id: string;
  label: string;
  pattern: string;
  max_score: number;
  notify_on_breach: boolean;
  matched_files: { path: string; score: number }[];
  compliant_count: number;
  breaching_count: number;
  status: 'ok' | 'warning' | 'critical';
}

interface Props {
  budget: BudgetWithStats;
  onEdit: () => void;
  onDelete: (id: string) => void;
}

const STATUS_STYLES = {
  ok: { border: '1px solid rgba(72,199,116,0.4)', glow: 'rgba(72,199,116,0.08)', label: 'rgba(72,199,116,1)', text: '✓ Passing' },
  warning: { border: '1px solid rgba(236,161,53,0.4)', glow: 'rgba(236,161,53,0.08)', label: 'rgba(236,161,53,1)', text: `⚠ Warning` },
  critical: { border: '1px solid rgba(232,17,35,0.4)', glow: 'rgba(232,17,35,0.08)', label: 'rgba(232,17,35,1)', text: `✕ Breached` },
};

export const BudgetCard: React.FC<Props> = ({ budget, onEdit, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[budget.status];
  const total = budget.matched_files.length;
  const passPercent = total > 0 ? (budget.compliant_count / total) * 100 : 100;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="card-glass"
      style={{ border: style.border, background: style.glow, cursor: 'pointer' }}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{budget.label}</div>
          <code style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {budget.pattern}
          </code>
        </div>
        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: `${style.label}18`, color: style.label, fontWeight: 600, flexShrink: 0 }}>
          {budget.status === 'critical' ? `${STATUS_STYLES.critical.text} (${budget.breaching_count})` : style.text}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ margin: '10px 0 6px', height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${passPercent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          style={{ height: '100%', background: style.label, borderRadius: '2px' }}
        />
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)' }}>
        <span>Max: <strong style={{ color: 'var(--text-primary)' }}>{budget.max_score}</strong></span>
        <span>Matched: <strong style={{ color: 'var(--text-primary)' }}>{total}</strong></span>
        {budget.breaching_count > 0 && (
          <span style={{ color: style.label }}>Breaching: <strong>{budget.breaching_count}</strong></span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }}
          style={{ background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '3px', padding: '2px 6px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px' }}>
          Edit
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(budget.id); }}
          style={{ background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '3px', padding: '2px 6px', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '10px' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--debt-critical)'; e.currentTarget.style.borderColor = 'var(--debt-critical)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}>
          ✕
        </button>
      </div>

      {/* Expanded file list */}
      {expanded && budget.breaching_count > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', fontWeight: 600 }}>OVER-BUDGET FILES</div>
          {budget.matched_files
            .filter((f) => f.score > budget.max_score)
            .slice(0, 8)
            .map((f) => (
              <div key={f.path} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: '11px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="mono" style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.path}</span>
                <span style={{ color: f.score >= 80 ? 'var(--debt-critical)' : 'var(--debt-high)', fontWeight: 700, marginLeft: '8px', flexShrink: 0 }}>{f.score.toFixed(0)}</span>
              </div>
            ))}
          {budget.breaching_count > 8 && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>+{budget.breaching_count - 8} more</div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
};
