import React from 'react';
import { motion } from 'framer-motion';

interface RegisterItem {
  id: string;
  created_at: number;
  title: string;
  description: string;
  file_path: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  item_type: string;
  owner: string | null;
  target_sprint: string | null;
  estimated_hours: number | null;
  status: 'open' | 'in_progress' | 'resolved' | 'deferred' | 'accepted';
  tags: string[];
}

interface Props {
  item: RegisterItem;
  onEdit: () => void;
  onDelete: (id: string) => void;
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'var(--debt-critical)',
  high: 'var(--debt-high)',
  medium: 'var(--debt-medium)',
  low: 'var(--debt-low)',
};

const STATUS_COLOR: Record<string, string> = {
  open: 'var(--accent)',
  in_progress: 'var(--debt-medium)',
  resolved: 'var(--debt-low)',
  deferred: 'var(--text-muted)',
  accepted: 'rgba(255,255,255,0.5)',
};

export const DebtRegisterItem: React.FC<Props> = ({ item, onEdit, onDelete }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="card-glass"
      style={{ borderLeft: `3px solid ${SEVERITY_COLOR[item.severity]}`, padding: '10px 14px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        {/* Severity badge */}
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '3px',
          background: `${SEVERITY_COLOR[item.severity]}22`, color: SEVERITY_COLOR[item.severity],
          textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, marginTop: '2px',
        }}>
          {item.severity}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </span>
            <span style={{ fontSize: '9px', color: STATUS_COLOR[item.status], background: `${STATUS_COLOR[item.status]}18`, padding: '1px 5px', borderRadius: '2px', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
              {item.status.replace('_', ' ')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            {item.file_path && (
              <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px', whiteSpace: 'nowrap' }}>
                📄 {item.file_path}
              </span>
            )}
            {item.item_type && <span>🏷 {item.item_type}</span>}
            {item.owner && <span>👤 {item.owner}</span>}
            {item.target_sprint && <span>🏃 {item.target_sprint}</span>}
            {item.estimated_hours && <span>⏱ {item.estimated_hours}h</span>}
          </div>

          {item.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
              {item.tags.map((tag) => (
                <span key={tag} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '2px', background: 'rgba(99,179,237,0.1)', color: 'var(--accent)', border: '1px solid rgba(99,179,237,0.2)' }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button onClick={onEdit} style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', borderRadius: '3px', padding: '3px 7px', cursor: 'pointer', fontSize: '11px' }}>
            Edit
          </button>
          <button onClick={() => onDelete(item.id)} style={{ background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', borderRadius: '3px', padding: '3px 7px', cursor: 'pointer', fontSize: '11px' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--debt-critical)'; e.currentTarget.style.color = 'var(--debt-critical)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
            ✕
          </button>
        </div>
      </div>
    </motion.div>
  );
};
