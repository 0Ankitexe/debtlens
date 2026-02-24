import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RegisterItem {
  id: string;
  created_at: number;
  updated_at: number;
  title: string;
  description: string;
  file_path: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  item_type: 'design' | 'code' | 'test' | 'dependency' | 'documentation' | 'security' | 'performance';
  owner: string | null;
  target_sprint: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  status: 'open' | 'in_progress' | 'resolved' | 'deferred' | 'accepted';
  tags: string[];
  linked_commit: string | null;
  notes: string | null;
}

interface Props {
  item: RegisterItem | null;
  workspacePath: string;
  onSave: (item: RegisterItem) => void;
  onClose: () => void;
}

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
const TYPES = ['design', 'code', 'test', 'dependency', 'documentation', 'security', 'performance'] as const;
const STATUSES = ['open', 'in_progress', 'resolved', 'deferred', 'accepted'] as const;
const SEVERITY_COLOR: Record<string, string> = { critical: 'var(--debt-critical)', high: 'var(--debt-high)', medium: 'var(--debt-medium)', low: 'var(--debt-low)' };

export const RegisterForm: React.FC<Props> = ({ item, onSave, onClose }) => {
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [filePath, setFilePath] = useState(item?.file_path ?? '');
  const [severity, setSeverity] = useState<typeof SEVERITIES[number]>(item?.severity ?? 'medium');
  const [itemType, setItemType] = useState<typeof TYPES[number]>(item?.item_type ?? 'code');
  const [owner, setOwner] = useState(item?.owner ?? '');
  const [targetSprint, setTargetSprint] = useState(item?.target_sprint ?? '');
  const [estimatedHours, setEstimatedHours] = useState(item?.estimated_hours?.toString() ?? '');
  const [actualHours, setActualHours] = useState(item?.actual_hours?.toString() ?? '');
  const [status, setStatus] = useState<typeof STATUSES[number]>(item?.status ?? 'open');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [linkedCommit, setLinkedCommit] = useState(item?.linked_commit ?? '');
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      setTags((t) => [...t, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleSubmit = () => {
    if (!title.trim()) { setError('Title is required'); return; }
    onSave({
      id: item?.id ?? crypto.randomUUID(),
      created_at: item?.created_at ?? Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
      title: title.trim(),
      description: description.trim(),
      file_path: filePath.trim() || null,
      severity,
      item_type: itemType,
      owner: owner.trim() || null,
      target_sprint: targetSprint.trim() || null,
      estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
      actual_hours: actualHours ? parseFloat(actualHours) : null,
      status,
      tags,
      linked_commit: linkedCommit.trim() || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 8 }}
          animate={{ scale: 1, y: 0 }}
          className="card-glass"
          style={{ width: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 600, fontSize: '15px' }}>{item ? 'Edit Register Item' : 'New Register Item'}</div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
          </div>

          {/* Form */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {error && <div style={{ padding: '8px', background: 'rgba(232,17,35,0.1)', border: '1px solid rgba(232,17,35,0.3)', borderRadius: '4px', fontSize: '12px', color: 'var(--debt-critical)' }}>{error}</div>}

            <Field label="Title *">
              <input value={title} onChange={(e) => { setTitle(e.target.value); setError(''); }} placeholder="Brief description of the debt item" style={inputStyle} />
            </Field>

            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detailed description (markdown supported)" rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: '11px' }} />
            </Field>

            {/* Severity selector */}
            <Field label="Severity">
              <div style={{ display: 'flex', gap: '6px' }}>
                {SEVERITIES.map((s) => (
                  <button key={s} onClick={() => setSeverity(s)} style={{
                    flex: 1, padding: '5px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: severity === s ? 700 : 400,
                    border: `1px solid ${severity === s ? SEVERITY_COLOR[s] : 'var(--border-subtle)'}`,
                    background: severity === s ? `${SEVERITY_COLOR[s]}20` : 'transparent',
                    color: severity === s ? SEVERITY_COLOR[s] : 'var(--text-muted)',
                    textTransform: 'capitalize',
                  }}>{s}</button>
                ))}
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Type">
                <select value={itemType} onChange={(e) => setItemType(e.target.value as typeof TYPES[number])} style={{ ...inputStyle, appearance: 'none' }}>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={status} onChange={(e) => setStatus(e.target.value as typeof STATUSES[number])} style={{ ...inputStyle, appearance: 'none' }}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </Field>
            </div>

            <Field label="File Path (relative)">
              <input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="src/components/MyFile.tsx" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Owner">
                <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="@username" style={inputStyle} />
              </Field>
              <Field label="Target Sprint">
                <input value={targetSprint} onChange={(e) => setTargetSprint(e.target.value)} placeholder="Sprint 14" style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Estimated Hours">
                <input type="number" min="0" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} placeholder="8" style={inputStyle} />
              </Field>
              <Field label="Actual Hours">
                <input type="number" min="0" step="0.5" value={actualHours} onChange={(e) => setActualHours(e.target.value)} placeholder="0" style={inputStyle} />
              </Field>
            </div>

            <Field label="Tags (Enter or comma to add)">
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '6px', padding: '6px', background: 'rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {tags.map((tag) => (
                  <span key={tag} style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '3px', background: 'rgba(99,179,237,0.12)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {tag}
                    <button onClick={() => setTags((t) => t.filter((x) => x !== tag))} style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={handleTagKeyDown}
                  placeholder="Add tag…" style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '11px', outline: 'none', minWidth: '80px', flex: 1 }} />
              </div>
            </Field>

            <Field label="Linked Commit">
              <input value={linkedCommit} onChange={(e) => setLinkedCommit(e.target.value)} placeholder="abc1234" style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
            </Field>

            <Field label="Notes">
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional context, decisions, links…" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={onClose} style={{ padding: '7px 16px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '13px' }}>Cancel</button>
            <button onClick={handleSubmit} style={{ padding: '7px 20px', background: 'var(--accent)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#000', fontWeight: 700, fontSize: '13px' }}>
              {item ? 'Save Changes' : 'Create Item'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: '6px',
  border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.06)',
  color: 'var(--text-primary)', fontSize: '12px', boxSizing: 'border-box',
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 500 }}>{label}</label>
    {children}
  </div>
);
