import React, { useState } from 'react';
import { useSettingsStore } from '../../store/settingsStore';
import { WeightSliders } from './WeightSliders';

type Tab = 'weights' | 'analysis' | 'thresholds' | 'heatmap' | 'snapshot';
const TABS: { id: Tab; label: string }[] = [
  { id: 'weights', label: 'Score Weights' },
  { id: 'analysis', label: 'Analysis' },
  { id: 'thresholds', label: 'Thresholds' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'snapshot', label: 'Snapshots' },
];

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('weights');
  const store = useSettingsStore();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '10px' }}>Settings</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '5px 12px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer',
                border: `1px solid ${activeTab === tab.id ? 'var(--accent)' : 'var(--border-subtle)'}`,
                background: activeTab === tab.id ? 'rgba(99,179,237,0.12)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: activeTab === tab.id ? 600 : 400,
              }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {activeTab === 'weights' && <WeightSliders />}

        {activeTab === 'analysis' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px' }}>
            <Field label={`Git History Window: ${store.gitHistoryDays} days`}>
              <input type="range" min="7" max="365" value={store.gitHistoryDays}
                onChange={(e) => store.setGitHistoryDays(parseInt(e.target.value))}
                style={{ width: '100%' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                <span>7 days</span><span>365 days</span>
              </div>
            </Field>
            <Field label={`Churn Normalization Percentile: ${store.churnNormalizationPercentile}%`}>
              <input type="range" min="50" max="99" value={store.churnNormalizationPercentile}
                onChange={(e) => store.setChurnNormalizationPercentile(parseInt(e.target.value))}
                style={{ width: '100%' }} />
            </Field>
          </div>
        )}

        {activeTab === 'thresholds' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px' }}>
            <Field label="Warning Threshold">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min="30" max="90" value={store.warningThreshold}
                  onChange={(e) => store.setWarningThreshold(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--debt-high)' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--debt-high)', minWidth: '30px' }}>{store.warningThreshold}</span>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Files above this score are flagged as "High Debt"</p>
            </Field>
            <Field label="Critical Threshold">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min="50" max="100" value={store.criticalThreshold}
                  onChange={(e) => store.setCriticalThreshold(parseInt(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--debt-critical)' }} />
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--debt-critical)', minWidth: '30px' }}>{store.criticalThreshold}</span>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Files above this score are flagged as "Critical Debt"</p>
            </Field>
            <Field label="Bus Factor Warning (%)">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="range" min="50" max="95" value={store.busFactor}
                  onChange={(e) => store.setBusFactor(parseInt(e.target.value))}
                  style={{ flex: 1 }} />
                <span style={{ fontSize: '14px', fontWeight: 600, minWidth: '30px' }}>{store.busFactor}%</span>
              </div>
              <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Alert when a single author owns more than this % of a file</p>
            </Field>
          </div>
        )}

        {activeTab === 'heatmap' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px' }}>
            <Field label="Color Scheme">
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['default', 'heatwave', 'monochrome'] as const).map((scheme) => (
                  <button key={scheme} onClick={() => store.setColorScheme(scheme)}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '6px', cursor: 'pointer', textTransform: 'capitalize',
                      border: `1px solid ${store.colorScheme === scheme ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      background: store.colorScheme === scheme ? 'rgba(99,179,237,0.12)' : 'transparent',
                      color: store.colorScheme === scheme ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: store.colorScheme === scheme ? 700 : 400, fontSize: '12px',
                    }}>
                    {scheme}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Node Labels">
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['always', 'hover', 'never'] as const).map((mode) => (
                  <button key={mode} onClick={() => store.setNodeLabel(mode)}
                    style={{
                      flex: 1, padding: '6px', borderRadius: '4px', cursor: 'pointer', textTransform: 'capitalize',
                      border: `1px solid ${store.nodeLabel === mode ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      background: store.nodeLabel === mode ? 'rgba(99,179,237,0.12)' : 'transparent',
                      color: store.nodeLabel === mode ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: '12px',
                    }}>
                    {mode}
                  </button>
                ))}
              </div>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={store.animationsEnabled}
                onChange={(e) => store.setAnimationsEnabled(e.target.checked)} />
              Enable animations (transitions, zoom springs)
            </label>
          </div>
        )}

        {activeTab === 'snapshot' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '500px' }}>
            <Field label="Auto-Snapshot Schedule">
              <select style={selectStyle} value={store.snapshotSchedule}
                onChange={(e) => store.setSnapshotSchedule(e.target.value as 'weekly' | 'biweekly' | 'manual')}>
                <option value="weekly">Weekly (every 7 days)</option>
                <option value="biweekly">Bi-weekly (every 14 days)</option>
                <option value="manual">Manual only</option>
              </select>
            </Field>
            <Field label="Snapshot Retention">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input type="number" min="10" max="260" value={store.snapshotRetention}
                  onChange={(e) => store.setSnapshotRetention(parseInt(e.target.value || '52'))}
                  style={{ ...selectStyle, width: '80px' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>snapshots (≈ 1 year at weekly)</span>
              </div>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={store.notificationsEnabled}
                onChange={(e) => store.setNotificationsEnabled(e.target.checked)} />
              Show threshold alert notifications
            </label>
          </div>
        )}
      </div>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 500 }}>{label}</label>
    {children}
  </div>
);

const selectStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: '6px',
  border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.06)',
  color: 'var(--text-primary)', fontSize: '12px',
};
