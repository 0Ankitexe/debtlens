import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const TitleBar: React.FC = () => {
  const win = getCurrentWindow();

  return (
    <div className="titlebar" data-tauri-drag-region>
      <div
        data-tauri-drag-region
        style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, pointerEvents: 'none' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
          DebtLens
        </span>
      </div>

      {/* Window controls — pointer-events: auto overrides the drag region */}
      <div style={{ display: 'flex', gap: '4px', pointerEvents: 'auto' }}>
        <button
          className="btn"
          style={{ padding: '2px 10px', fontSize: '14px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          onClick={() => win.minimize()}
          title="Minimize"
        >
          ─
        </button>
        <button
          className="btn"
          style={{ padding: '2px 10px', fontSize: '12px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          onClick={() => win.toggleMaximize()}
          title="Maximize"
        >
          □
        </button>
        <button
          className="btn"
          style={{ padding: '2px 10px', fontSize: '14px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          onClick={() => win.close()}
          title="Close"
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,17,35,0.8)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          ✕
        </button>
      </div>
    </div>
  );
};
