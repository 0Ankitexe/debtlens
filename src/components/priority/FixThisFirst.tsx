import React, { useState } from 'react';
import { useDebtStore } from '../../store/debtStore';
import { FileDebtCard } from './FileDebtCard';
import { ROIEstimator } from './ROIEstimator';

export const FixThisFirst: React.FC = () => {
  const analysisResult = useDebtStore((s) => s.analysisResult);
  const [supervisedFiles, setSupervisedFiles] = useState<Set<string>>(new Set());

  if (!analysisResult) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
        <p>Run analysis to see the priority list</p>
      </div>
    );
  }

  const sorted = [...analysisResult.files].sort((a, b) => b.composite_score - a.composite_score);
  const activeFiles = sorted.filter((f) => !supervisedFiles.has(f.relative_path));
  const supervised = sorted.filter((f) => supervisedFiles.has(f.relative_path));
  const top5 = activeFiles.slice(0, 5);

  const handleMarkAcceptable = (path: string) => {
    setSupervisedFiles((prev) => new Set([...prev, path]));
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>Fix This First</h2>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            {activeFiles.length} files sorted by debt score · {analysisResult.high_debt_count} high-debt
          </p>
        </div>
      </div>

      {/* ROI Estimator */}
      <ROIEstimator files={top5} />

      {/* Priority list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {activeFiles.map((file, i) => (
          <FileDebtCard
            key={file.relative_path}
            file={file}
            rank={i + 1}
            onMarkAcceptable={handleMarkAcceptable}
          />
        ))}
      </div>

      {/* Supervised section */}
      {supervised.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <span>SUPERVISED FILES ({supervised.length})</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>
          {supervised.map((file) => (
            <FileDebtCard
              key={file.relative_path}
              file={file}
              rank={0}
              supervised
              onMarkAcceptable={handleMarkAcceptable}
            />
          ))}
        </div>
      )}
    </div>
  );
};
