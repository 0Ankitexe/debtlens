import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useDebtStore } from '../../store/debtStore';
import { watchlistCrud } from '../../lib/tauri';

interface PinnedFile {
  file_path: string;
  pinned_at: number;
}

interface Props {
  onSelectFile?: (path: string) => void;
}

function scoreColor(score: number): string {
  if (score < 40) return 'var(--debt-low)';
  if (score < 65) return 'var(--debt-medium)';
  if (score < 80) return 'var(--debt-high)';
  return 'var(--debt-critical)';
}

export const Watchlist: React.FC<Props> = ({ onSelectFile }) => {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const analysisResult = useDebtStore((s) => s.analysisResult);
  const [pinnedFiles, setPinnedFiles] = useState<PinnedFile[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  const loadPinned = useCallback(async () => {
    if (!workspace) return;
    try {
      const result = await watchlistCrud(workspace.path, 'list');
      setPinnedFiles(Array.isArray(result) ? result : []);
    } catch {
      setPinnedFiles([]);
    }
  }, [workspace]);

  useEffect(() => { loadPinned(); }, [loadPinned]);

  const handleUnpin = async (filePath: string) => {
    if (!workspace) return;
    await watchlistCrud(workspace.path, 'unpin', filePath);
    setPinnedFiles((prev) => prev.filter((f) => f.file_path !== filePath));
  };

  if (pinnedFiles.length === 0) return null;

  const getScore = (path: string) => {
    const file = analysisResult?.files.find((f) => f.relative_path === path);
    return file?.composite_score ?? null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      style={{
        position: 'absolute',
        top: '48px',
        right: '8px',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        width: collapsed ? '28px' : '180px',
        transition: 'width 0.2s ease',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        style={{
          background: 'rgba(17,18,28,0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          padding: '4px 8px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '10px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '4px',
        }}
      >
        <span>📌</span>
        {!collapsed && <span>WATCHLIST ({pinnedFiles.length}/5)</span>}
        <span style={{ fontSize: '8px' }}>{collapsed ? '◀' : '▶'}</span>
      </button>

      {/* Pinned files */}
      <AnimatePresence>
        {!collapsed && pinnedFiles.map((pf) => {
          const score = getScore(pf.file_path);
          const color = score !== null ? scoreColor(score) : 'var(--text-muted)';
          const fileName = pf.file_path.split('/').pop() ?? pf.file_path;

          return (
            <motion.div
              key={pf.file_path}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              style={{
                background: 'rgba(17,18,28,0.85)',
                backdropFilter: 'blur(12px)',
                border: `1px solid ${color}40`,
                borderLeft: `3px solid ${color}`,
                borderRadius: '6px',
                padding: '6px 8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onClick={() => onSelectFile?.(pf.file_path)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {fileName}
                </div>
              </div>
              {score !== null && (
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  color,
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                }}>
                  {score.toFixed(0)}
                </span>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); handleUnpin(pf.file_path); }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '10px',
                  padding: '0 2px',
                  flexShrink: 0,
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--debt-critical)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              >
                ✕
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
};
