import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { openWorkspace } from '../../lib/tauri';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useDebtStore } from '../../store/debtStore';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';

const SUPPORTED_LANGS = ['Rust', 'TypeScript', 'JavaScript', 'Python', 'Go', 'Java', 'C/C++', 'Ruby'];

export const EmptyState: React.FC = () => {
  const setWorkspace = useWorkspaceStore((s) => s.setWorkspace);
  const setLoading = useWorkspaceStore((s) => s.setLoading);
  const addRecentPath = useWorkspaceStore((s) => s.addRecentPath);
  const recentPaths = useWorkspaceStore((s) => s.recentPaths);
  const setError = useWorkspaceStore((s) => s.setError);
  const setActiveView = useDebtStore((s) => s.setActiveView);
  const [isDragOver, setIsDragOver] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  const handleOpen = async (path?: string) => {
    try {
      let selectedPath = path;

      if (!selectedPath) {
        const result = await open({ directory: true, multiple: false });
        if (!result) return;
        selectedPath = typeof result === 'string' ? result : result[0];
      }

      if (!selectedPath) return;

      setOpeningPath(selectedPath);
      setLoading(true);
      const meta = await openWorkspace(selectedPath);
      setWorkspace(meta);
      addRecentPath(selectedPath);
      setActiveView('heatmap');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setOpeningPath(null);
    }
  };

  // T061: Tauri file drop listener for drag-and-drop folders
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    listen<{ paths: string[] }>('tauri://drag-drop', (event) => {
      const paths = event.payload?.paths ?? [];
      if (paths.length > 0) {
        handleOpen(paths[0]);
      }
      setIsDragOver(false);
    }).then((fn) => { unlisten = fn; });

    listen('tauri://drag-enter', () => setIsDragOver(true)).then((fn) => {
      const prev = unlisten;
      unlisten = () => { prev?.(); fn(); };
    });

    listen('tauri://drag-leave', () => setIsDragOver(false)).then((fn) => {
      const prev = unlisten;
      unlisten = () => { prev?.(); fn(); };
    });

    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px',
        gap: '32px',
      }}
    >
      {/* Branding */}
      <div style={{ textAlign: 'center' }}>
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          style={{ display: 'inline-block', marginBottom: '16px' }}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.2">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </motion.div>
        <h1 style={{ fontSize: '28px', fontWeight: 700, margin: '0 0 8px 0', background: 'linear-gradient(135deg, var(--text-primary), var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          DebtLens
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
          Make technical debt visible, measurable, and actionable
        </p>
      </div>

      {/* Drop zone */}
      <AnimatePresence>
        <motion.div
          animate={isDragOver ? { scale: 1.02, borderColor: 'var(--accent)' } : { scale: 1, borderColor: 'rgba(255,255,255,0.12)' }}
          transition={{ duration: 0.15 }}
          style={{
            width: '100%',
            maxWidth: '480px',
            padding: '40px',
            border: `2px dashed ${isDragOver ? 'var(--accent)' : 'rgba(255,255,255,0.12)'}`,
            borderRadius: '12px',
            textAlign: 'center',
            background: isDragOver ? 'rgba(99,179,237,0.06)' : 'rgba(255,255,255,0.02)',
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onClick={() => handleOpen()}
        >
          {openingPath ? (
            <div>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>⟳</div>
              <p style={{ color: 'var(--accent)', fontSize: '13px', margin: 0, fontFamily: 'var(--font-mono)' }}>
                {openingPath.split('/').slice(-2).join('/')}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '11px', margin: '4px 0 0' }}>Opening repository…</p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>{isDragOver ? '📂' : '📁'}</div>
              <p style={{ fontSize: '15px', fontWeight: 500, margin: '0 0 6px', color: isDragOver ? 'var(--accent)' : 'var(--text-primary)' }}>
                {isDragOver ? 'Drop your repository here' : 'Open a Git Repository'}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                Drag & drop a folder, or click to browse
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Supported languages */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>Supports</p>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {SUPPORTED_LANGS.map((lang) => (
            <span key={lang} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              {lang}
            </span>
          ))}
        </div>
      </div>

      {/* Recent workspaces */}
      {recentPaths.length > 0 && (
        <div style={{ width: '100%', maxWidth: '480px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', textAlign: 'center' }}>Recent Repositories</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {recentPaths.map((path) => (
              <button
                key={path}
                onClick={() => handleOpen(path)}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  transition: 'all 0.15s',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99,179,237,0.08)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                <span style={{ color: 'var(--text-muted)', marginRight: '6px' }}>📁</span>
                {path.split('/').slice(-2).join('/')}
                <span style={{ color: 'var(--text-muted)', fontSize: '10px', marginLeft: '8px' }}>{path}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
};
