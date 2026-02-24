import React, { useState, useEffect, useCallback } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useDebtStore } from '../../store/debtStore';
import { formatScore } from '../../lib/formatters';
import { budgetCrud } from '../../lib/tauri';

interface BudgetItem {
  id: string;
  pattern: string;
  max_score: number;
}

function matchGlob(pattern: string, path: string): boolean {
  const regexStr = pattern.replace(/\./g, '\\.').replace(/\*\*/g, '{{D}}').replace(/\*/g, '[^/]*').replace(/{{D}}/g, '.*');
  return new RegExp(`^${regexStr}$`).test(path);
}

export const StatusBar: React.FC = () => {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const analysisResult = useDebtStore((s) => s.analysisResult);
  const isAnalyzing = useDebtStore((s) => s.isAnalyzing);
  const progress = useDebtStore((s) => s.analysisProgress);
  const [budgetStatus, setBudgetStatus] = useState<{ total: number; breaches: number } | null>(null);

  const checkBudgets = useCallback(async () => {
    if (!workspace || !analysisResult) { setBudgetStatus(null); return; }
    try {
      const budgets = await budgetCrud(workspace.path, 'list') as BudgetItem[];
      if (!Array.isArray(budgets) || budgets.length === 0) { setBudgetStatus(null); return; }
      let breaches = 0;
      for (const b of budgets) {
        const hasBreech = analysisResult.files.some(
          (f) => matchGlob(b.pattern, f.relative_path) && f.composite_score > b.max_score
        );
        if (hasBreech) breaches++;
      }
      setBudgetStatus({ total: budgets.length, breaches });
    } catch {
      setBudgetStatus(null);
    }
  }, [workspace, analysisResult]);

  useEffect(() => { checkBudgets(); }, [checkBudgets]);

  return (
    <div className="statusbar">
      {/* Workspace info */}
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
        {workspace ? `${workspace.repo_name} (${workspace.branch})` : 'No workspace'}
      </span>

      <span style={{ color: 'var(--border-subtle)' }}>│</span>

      {/* File count */}
      {workspace && (
        <span>{workspace.file_count} files</span>
      )}

      {/* Analysis status */}
      {isAnalyzing && progress && (
        <>
          <span style={{ color: 'var(--border-subtle)' }}>│</span>
          <span style={{ color: 'var(--accent)' }}>
            Analyzing {progress.current}/{progress.total}
          </span>
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Budget compliance */}
      {budgetStatus && (
        <span style={{
          fontSize: '11px', padding: '1px 6px', borderRadius: '3px', marginRight: '6px',
          background: budgetStatus.breaches > 0 ? 'rgba(232,17,35,0.1)' : 'rgba(72,199,116,0.1)',
          color: budgetStatus.breaches > 0 ? 'var(--debt-critical)' : 'var(--debt-low)',
        }}>
          {budgetStatus.breaches > 0
            ? `Budget: ⚠ ${budgetStatus.breaches} breach${budgetStatus.breaches > 1 ? 'es' : ''}`
            : `Budget: ✓ ${budgetStatus.total}/${budgetStatus.total} OK`}
        </span>
      )}

      {/* Composite score */}
      {analysisResult && !isAnalyzing && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>Score:</span>
          <span
            className={`score-badge ${getScoreClass(analysisResult.workspace_score)}`}
            style={{ padding: '1px 6px', borderRadius: '4px' }}
          >
            {formatScore(analysisResult.workspace_score)}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            ({analysisResult.high_debt_count} high debt)
          </span>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {analysisResult.duration_ms}ms
          </span>
        </span>
      )}
    </div>
  );
};

function getScoreClass(score: number): string {
  if (score < 35) return 'score-low';
  if (score < 65) return 'score-medium';
  if (score < 80) return 'score-high';
  return 'score-critical';
}
