import React from 'react';

type FilterMode = 'all' | 'high' | 'critical';
type ViewMode = 'treemap' | 'graph';

interface Props {
  filter: FilterMode;
  onFilterChange: (f: FilterMode) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (m: ViewMode) => void;
}

const FILTERS: { value: FilterMode; label: string }[] = [
  { value: 'all', label: 'All Files' },
  { value: 'high', label: 'High Debt (≥65)' },
  { value: 'critical', label: 'Critical (≥80)' },
];

export const FilterToolbar: React.FC<Props> = ({ filter, onFilterChange, viewMode = 'treemap', onViewModeChange }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '6px 12px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(0,0,0,0.2)',
      flexShrink: 0,
    }}>
      {/* View toggle */}
      <div style={{ display: 'flex', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border-subtle)', marginRight: '8px' }}>
        <button onClick={() => onViewModeChange?.('treemap')} style={{
          padding: '3px 10px', fontSize: '11px', cursor: 'pointer', border: 'none',
          background: viewMode === 'treemap' ? 'rgba(99,179,237,0.15)' : 'transparent',
          color: viewMode === 'treemap' ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: viewMode === 'treemap' ? 600 : 400,
        }}>▦ Treemap</button>
        <button onClick={() => onViewModeChange?.('graph')} style={{
          padding: '3px 10px', fontSize: '11px', cursor: 'pointer', border: 'none', borderLeft: '1px solid var(--border-subtle)',
          background: viewMode === 'graph' ? 'rgba(99,179,237,0.15)' : 'transparent',
          color: viewMode === 'graph' ? 'var(--accent)' : 'var(--text-muted)',
          fontWeight: viewMode === 'graph' ? 600 : 400,
        }}>⚡ Coupling</button>
      </div>

      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>Show:</span>
      {FILTERS.map((f) => (
        <button
          key={f.value}
          onClick={() => onFilterChange(f.value)}
          style={{
            padding: '3px 10px',
            borderRadius: '4px',
            border: '1px solid ' + (filter === f.value ? 'var(--accent)' : 'var(--border-subtle)'),
            background: filter === f.value ? 'rgba(99,179,237,0.15)' : 'transparent',
            color: filter === f.value ? 'var(--accent)' : 'var(--text-secondary)',
            fontSize: '11px',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {f.label}
        </button>
      ))}

      <div style={{ flex: 1 }} />

      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
        {viewMode === 'treemap' ? 'Sized by LOC · Colored by debt score' : 'Node size ∝ LOC · Edge = co-change'}
      </span>
    </div>
  );
};
