import React from 'react';
import { useDebtStore } from '../../store/debtStore';

type ViewTab = 'heatmap' | 'fixfirst' | 'timeline' | 'register' | 'budget' | 'settings';

const tabs: { id: ViewTab; label: string; icon: string }[] = [
  { id: 'heatmap', label: 'Heatmap', icon: '🗺️' },
  { id: 'fixfirst', label: 'Fix First', icon: '🎯' },
  { id: 'timeline', label: 'Timeline', icon: '📈' },
  { id: 'register', label: 'Register', icon: '📋' },
  { id: 'budget', label: 'Budgets', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export const LeftPanel: React.FC = () => {
  const activeView = useDebtStore((s) => s.activeView);
  const setActiveView = useDebtStore((s) => s.setActiveView);

  return (
    <div className="sidebar">
      <div className="panel-header" style={{ padding: '12px 16px 8px' }}>
        VIEWS
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`nav-item ${activeView === tab.id ? 'active' : ''}`}
          onClick={() => setActiveView(tab.id)}
          role="button"
          tabIndex={0}
        >
          <span style={{ fontSize: '16px' }}>{tab.icon}</span>
          <span>{tab.label}</span>
        </div>
      ))}
    </div>
  );
};
