import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useDebtStore } from '../../store/debtStore';
import { registerCrud } from '../../lib/tauri';
import { RegisterForm } from './RegisterForm';
import { DebtRegisterItem } from './DebtRegisterItem';

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

type FilterStatus = 'all' | 'open' | 'in_progress' | 'resolved' | 'deferred' | 'accepted';
type SortField = 'created_at' | 'severity' | 'status' | 'estimated_hours';

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export const DebtRegister: React.FC = () => {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const analysisResult = useDebtStore((s) => s.analysisResult);
  const [items, setItems] = useState<RegisterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<RegisterItem | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selectedImports, setSelectedImports] = useState<Set<string>>(new Set());

  const loadItems = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const result = await registerCrud(workspace.path, 'list');
      setItems(Array.isArray(result) ? result : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleDelete = async (id: string) => {
    if (!workspace) return;
    await registerCrud(workspace.path, 'delete', undefined, id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSave = async (item: RegisterItem) => {
    if (!workspace) return;
    if (editItem) {
      await registerCrud(workspace.path, 'update', item);
      setItems((prev) => prev.map((i) => i.id === item.id ? item : i));
    } else {
      await registerCrud(workspace.path, 'create', item);
      setItems((prev) => [item, ...prev]);
    }
    setShowForm(false);
    setEditItem(null);
  };

  // Import from analysis: files >65 not in register
  const importCandidates = analysisResult?.files.filter(
    (f) => f.composite_score > 65 && !items.some((i) => i.file_path === f.relative_path)
  ) ?? [];

  const handleImportSelected = async () => {
    if (!workspace) return;
    for (const path of selectedImports) {
      const file = importCandidates.find((f) => f.relative_path === path);
      if (!file) continue;
      const newItem: RegisterItem = {
        id: crypto.randomUUID(),
        created_at: Math.floor(Date.now() / 1000),
        updated_at: Math.floor(Date.now() / 1000),
        title: `High debt: ${path.split('/').pop()}`,
        description: `Auto-imported from analysis. Composite score: ${file.composite_score.toFixed(1)}`,
        file_path: file.relative_path,
        severity: file.composite_score >= 80 ? 'critical' : 'high',
        item_type: 'code',
        owner: null,
        target_sprint: null,
        estimated_hours: null,
        actual_hours: null,
        status: 'open',
        tags: ['auto-imported'],
        linked_commit: null,
        notes: null,
      };
      await registerCrud(workspace.path, 'create', newItem);
      setItems((prev) => [newItem, ...prev]);
    }
    setShowImport(false);
    setSelectedImports(new Set());
  };

  // Export
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'debt-register.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    const cols = ['id', 'title', 'severity', 'item_type', 'file_path', 'owner', 'status', 'estimated_hours', 'target_sprint', 'created_at'];
    const rows = items.map((i) => {
      const obj = JSON.parse(JSON.stringify(i)) as Record<string, unknown>;
      return cols.map((c) => JSON.stringify(obj[c] ?? '')).join(',');
    });
    const csv = [cols.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'debt-register.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  // Filter + sort
  const filtered = items
    .filter((i) => filterStatus === 'all' || i.status === filterStatus)
    .filter((i) => !searchQuery || i.title.toLowerCase().includes(searchQuery.toLowerCase()) || (i.file_path ?? '').includes(searchQuery))
    .sort((a, b) => {
      if (sortField === 'severity') return (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
      if (sortField === 'estimated_hours') return (b.estimated_hours ?? 0) - (a.estimated_hours ?? 0);
      if (sortField === 'status') return a.status.localeCompare(b.status);
      return b.created_at - a.created_at;
    });

  if (!workspace) {
    return <div className="empty-state" style={{ height: '100%' }}><p>Open a repository to use the Debt Register</p></div>;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items…"
          style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '12px', width: '180px' }}
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '12px' }}>
          {['all', 'open', 'in_progress', 'resolved', 'deferred', 'accepted'].map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All Status' : s.replace('_', ' ')}</option>
          ))}
        </select>
        <select value={sortField} onChange={(e) => setSortField(e.target.value as SortField)}
          style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontSize: '12px' }}>
          <option value="created_at">Newest First</option>
          <option value="severity">By Severity</option>
          <option value="status">By Status</option>
          <option value="estimated_hours">By Effort</option>
        </select>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{filtered.length} items</span>

        {importCandidates.length > 0 && (
          <button onClick={() => setShowImport(true)} className="btn"
            style={{ fontSize: '11px', padding: '4px 10px', background: 'rgba(236,161,53,0.12)', border: '1px solid rgba(236,161,53,0.3)', borderRadius: '4px', cursor: 'pointer', color: 'var(--debt-high)' }}>
            Import from Analysis ({importCandidates.length})
          </button>
        )}
        <button onClick={handleExportCSV} className="btn" style={{ fontSize: '11px', padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}>CSV</button>
        <button onClick={handleExportJSON} className="btn" style={{ fontSize: '11px', padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)' }}>JSON</button>
        <button onClick={() => { setEditItem(null); setShowForm(true); }} className="btn btn-primary"
          style={{ fontSize: '11px', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer', background: 'var(--accent)', border: 'none', color: '#000', fontWeight: 600 }}>
          + New Item
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {loading && <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Loading…</p>}
        {!loading && filtered.length === 0 && (
          <div className="empty-state" style={{ height: '200px' }}>
            <p style={{ fontSize: '13px' }}>No register items{filterStatus !== 'all' ? ` with status "${filterStatus}"` : ''}.</p>
            <button onClick={() => { setEditItem(null); setShowForm(true); }} className="btn btn-primary"
              style={{ marginTop: '8px', padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#000', fontWeight: 600, fontSize: '12px' }}>
              Create First Item
            </button>
          </div>
        )}
        <AnimatePresence>
          {filtered.map((item) => (
            <DebtRegisterItem
              key={item.id}
              item={item}
              onEdit={() => { setEditItem(item); setShowForm(true); }}
              onDelete={handleDelete}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Register Form slide-in */}
      {showForm && (
        <RegisterForm
          item={editItem}
          workspacePath={workspace.path}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {/* Import Modal */}
      <AnimatePresence>
        {showImport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}
            onClick={() => setShowImport(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="card-glass"
              style={{ width: '560px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
              onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '14px' }}>Import from Analysis</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{importCandidates.length} high-debt files not yet in register</div>
                </div>
                <button onClick={() => setShowImport(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {importCandidates.map((f) => (
                  <label key={f.relative_path} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '8px', borderRadius: '4px', cursor: 'pointer', background: selectedImports.has(f.relative_path) ? 'rgba(99,179,237,0.08)' : 'transparent', marginBottom: '4px' }}>
                    <input type="checkbox" checked={selectedImports.has(f.relative_path)}
                      onChange={(e) => setSelectedImports((s) => { const n = new Set(s); e.target.checked ? n.add(f.relative_path) : n.delete(f.relative_path); return n; })} />
                    <span className="mono" style={{ fontSize: '11px', flex: 1, color: 'var(--text-secondary)' }}>{f.relative_path}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: f.composite_score >= 80 ? 'var(--debt-critical)' : 'var(--debt-high)' }}>{f.composite_score.toFixed(0)}</span>
                  </label>
                ))}
              </div>
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => setSelectedImports(new Set(importCandidates.map((f) => f.relative_path)))}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}>
                  Select All
                </button>
                <button onClick={handleImportSelected} disabled={selectedImports.size === 0}
                  style={{ padding: '6px 16px', background: 'var(--accent)', border: 'none', borderRadius: '4px', cursor: selectedImports.size === 0 ? 'not-allowed' : 'pointer', color: '#000', fontWeight: 600, fontSize: '12px', opacity: selectedImports.size === 0 ? 0.5 : 1 }}>
                  Import {selectedImports.size > 0 ? `${selectedImports.size} Items` : ''}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
