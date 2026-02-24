import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useDebtStore } from '../../store/debtStore';
import { budgetCrud } from '../../lib/tauri';
import { BudgetCard } from './BudgetCard';

interface DebtBudget {
  id: string;
  pattern: string;
  label: string;
  max_score: number;
  created_at: number;
  notify_on_breach: boolean;
}

interface BudgetWithStats extends DebtBudget {
  matched_files: { path: string; score: number }[];
  compliant_count: number;
  breaching_count: number;
  status: 'ok' | 'warning' | 'critical';
}

export const DebtBudget: React.FC = () => {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const analysisResult = useDebtStore((s) => s.analysisResult);
  const [budgets, setBudgets] = useState<BudgetWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editBudget, setEditBudget] = useState<DebtBudget | null>(null);
  const [formData, setFormData] = useState({ label: '', pattern: '', max_score: 65, notify_on_breach: true });
  const [formError, setFormError] = useState('');

  const loadBudgets = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const raw = await budgetCrud(workspace.path, 'list') as DebtBudget[];
      const budgetList = Array.isArray(raw) ? raw : [];

      // Evaluate each budget against current analysis
      const withStats: BudgetWithStats[] = budgetList.map((b) => {
        const files = analysisResult?.files ?? [];
        const matched = files.filter((f) => matchGlob(b.pattern, f.relative_path));
        const breaching = matched.filter((f) => f.composite_score > b.max_score);
        const status: 'ok' | 'warning' | 'critical' =
          breaching.length === 0 ? 'ok' :
          breaching.length <= 2 ? 'warning' : 'critical';

        return {
          ...b,
          matched_files: matched.map((f) => ({ path: f.relative_path, score: f.composite_score })),
          compliant_count: matched.length - breaching.length,
          breaching_count: breaching.length,
          status,
        };
      });

      setBudgets(withStats);
    } catch {
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, [workspace, analysisResult]);

  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  const handleSave = async () => {
    if (!workspace) return;
    if (!formData.label.trim()) { setFormError('Label is required'); return; }
    if (!formData.pattern.trim()) { setFormError('Pattern is required'); return; }

    const item: DebtBudget = {
      id: editBudget?.id ?? crypto.randomUUID(),
      label: formData.label,
      pattern: formData.pattern,
      max_score: formData.max_score,
      created_at: editBudget?.created_at ?? Math.floor(Date.now() / 1000),
      notify_on_breach: formData.notify_on_breach,
    };

    await budgetCrud(workspace.path, editBudget ? 'update' : 'create', item);
    setShowForm(false);
    setEditBudget(null);
    setFormData({ label: '', pattern: '', max_score: 65, notify_on_breach: true });
    loadBudgets();
  };

  const handleDelete = async (id: string) => {
    if (!workspace) return;
    await budgetCrud(workspace.path, 'delete', undefined, id);
    setBudgets((prev) => prev.filter((b) => b.id !== id));
  };

  if (!workspace) {
    return <div className="empty-state" style={{ height: '100%' }}><p>Open a repository to use Debt Budgets</p></div>;
  }

  const breachCount = budgets.filter((b) => b.status !== 'ok').length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '14px' }}>Debt Budgets</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Quality gates with glob-pattern score thresholds
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {budgets.length > 0 && (
          <div style={{
            fontSize: '12px', padding: '4px 10px', borderRadius: '6px',
            background: breachCount > 0 ? 'rgba(232,17,35,0.1)' : 'rgba(72,199,116,0.1)',
            border: `1px solid ${breachCount > 0 ? 'rgba(232,17,35,0.3)' : 'rgba(72,199,116,0.3)'}`,
            color: breachCount > 0 ? 'var(--debt-critical)' : 'var(--debt-low)',
          }}>
            {breachCount > 0 ? `⚠ ${breachCount} breach${breachCount > 1 ? 'es' : ''}` : `✓ All ${budgets.length} pass`}
          </div>
        )}
        <button
          onClick={() => { setEditBudget(null); setFormData({ label: '', pattern: '', max_score: 65, notify_on_breach: true }); setShowForm(true); }}
          style={{ padding: '5px 12px', background: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#000', fontWeight: 600, fontSize: '12px' }}>
          + New Budget
        </button>
      </div>

      {/* Budget grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px', alignContent: 'start' }}>
        {loading && <p style={{ color: 'var(--text-muted)', gridColumn: '1/-1', textAlign: 'center' }}>Loading budgets…</p>}
        {!loading && budgets.length === 0 && (
          <div className="empty-state" style={{ gridColumn: '1/-1', height: '200px' }}>
            <p style={{ fontSize: '13px' }}>No budgets defined yet.</p>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', maxWidth: '340px', textAlign: 'center', lineHeight: '1.5' }}>
              Create quality gates using glob patterns like <code>src/api/**</code> with a max allowed debt score.
            </p>
            <button
              onClick={() => { setShowForm(true); }}
              style={{ marginTop: '12px', padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#000', fontWeight: 600, fontSize: '12px' }}>
              Create First Budget
            </button>
          </div>
        )}
        <AnimatePresence>
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              budget={budget}
              onEdit={() => { setEditBudget(budget); setFormData({ label: budget.label, pattern: budget.pattern, max_score: budget.max_score, notify_on_breach: budget.notify_on_breach }); setShowForm(true); }}
              onDelete={handleDelete}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Budget Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => { setShowForm(false); setFormError(''); }}>
            <motion.div initial={{ scale: 0.93, y: 8 }} animate={{ scale: 1, y: 0 }} className="card-glass"
              style={{ width: '420px', padding: '0', overflow: 'hidden' }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{editBudget ? 'Edit Budget' : 'New Budget'}</div>
                <button onClick={() => { setShowForm(false); setFormError(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
              </div>
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {formError && <div style={{ padding: '8px', background: 'rgba(232,17,35,0.1)', borderRadius: '4px', fontSize: '12px', color: 'var(--debt-critical)' }}>{formError}</div>}
                <FormField label="Label">
                  <input value={formData.label} onChange={(e) => { setFormData((f) => ({ ...f, label: e.target.value })); setFormError(''); }}
                    placeholder="e.g. API Layer" style={inputStyle} />
                </FormField>
                <FormField label="Glob Pattern">
                  <input value={formData.pattern} onChange={(e) => { setFormData((f) => ({ ...f, pattern: e.target.value })); setFormError(''); }}
                    placeholder="e.g. src/api/** or src/**/*.ts" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '3px 0 0' }}>Use ** for any depth, * for any name</p>
                </FormField>
                <FormField label={`Max Score: ${formData.max_score}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="range" min="20" max="90" value={formData.max_score}
                      onChange={(e) => setFormData((f) => ({ ...f, max_score: parseInt(e.target.value) }))}
                      style={{ flex: 1 }} />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: formData.max_score >= 80 ? 'var(--debt-critical)' : formData.max_score >= 65 ? 'var(--debt-high)' : 'var(--debt-medium)', minWidth: '28px' }}>
                      {formData.max_score}
                    </span>
                  </div>
                </FormField>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={formData.notify_on_breach} onChange={(e) => setFormData((f) => ({ ...f, notify_on_breach: e.target.checked }))} />
                  Notify on breach
                </label>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button onClick={() => { setShowForm(false); setFormError(''); }} style={{ padding: '6px 14px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px' }}>Cancel</button>
                <button onClick={handleSave} style={{ padding: '6px 18px', background: 'var(--accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: '13px' }}>
                  {editBudget ? 'Save' : 'Create'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/** Simple glob matcher: supports * and ** */
function matchGlob(pattern: string, path: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{DOUBLE}}/g, '.*');
  return new RegExp(`^${regexStr}$`).test(path);
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: '6px',
  border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.06)',
  color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box',
};

const FormField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 500 }}>{label}</label>
    {children}
  </div>
);
