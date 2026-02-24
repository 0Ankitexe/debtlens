import type { ScoreWeights } from '../store/settingsStore';

interface ComponentScore {
  raw_score: number;
  details?: string[];
  [key: string]: unknown;
}

/**
 * Mirror of the Rust composite score computation for frontend previews
 * Used when weight sliders change to show real-time score updates
 */
export function computeCompositeScore(
  components: Record<string, ComponentScore>,
  weights: ScoreWeights
): number {
  return (
    (components.churn_rate?.raw_score ?? 0) * (weights.churn_rate ?? 0) +
    (components.code_smell_density?.raw_score ?? 0) * (weights.code_smell_density ?? 0) +
    (components.coupling_index?.raw_score ?? 0) * (weights.coupling_index ?? 0) +
    (components.change_coupling?.raw_score ?? 0) * (weights.change_coupling ?? 0) +
    (components.test_coverage_gap?.raw_score ?? 0) * (weights.test_coverage_gap ?? 0) +
    (components.knowledge_concentration?.raw_score ?? 0) * (weights.knowledge_concentration ?? 0) +
    (components.cyclomatic_complexity?.raw_score ?? 0) * (weights.cyclomatic_complexity ?? 0) +
    (components.decision_staleness?.raw_score ?? 0) * (weights.decision_staleness ?? 0)
  );
}

/**
 * Suggested remediation actions based on component scores.
 * Accepts any record with at least raw_score.
 */
export function getSuggestedActions(
  components: Record<string, { raw_score: number; details?: string[] }>
): string[] {
  const actions: string[] = [];

  if ((components.code_smell_density?.raw_score ?? 0) > 50) {
    if (components.code_smell_density?.details?.some((d) => d.includes('god function'))) {
      actions.push('Extract large functions into smaller, focused functions');
    }
    actions.push('Address code smells — reduce density across the file');
  }

  if ((components.churn_rate?.raw_score ?? 0) > 60) {
    actions.push('Stabilize this file — high change frequency often signals unclear responsibilities');
  }

  if ((components.coupling_index?.raw_score ?? 0) > 50) {
    actions.push('Reduce import coupling — consider dependency inversion or facade patterns');
  }

  if ((components.test_coverage_gap?.raw_score ?? 0) > 60) {
    actions.push('Write tests for this file — no co-located test file detected');
  }

  if ((components.knowledge_concentration?.raw_score ?? 0) > 60) {
    actions.push('Spread ownership — pair program or assign code review to other team members');
  }

  if ((components.cyclomatic_complexity?.raw_score ?? 0) > 50) {
    actions.push('Simplify control flow — extract branching logic or use early returns');
  }

  if ((components.decision_staleness?.raw_score ?? 0) > 50) {
    actions.push('Review or create an ADR documenting the design rationale for this file');
  }

  if ((components.change_coupling?.raw_score ?? 0) > 50) {
    actions.push('Investigate co-change partners — consider merging or decoupling');
  }

  return actions.length > 0 ? actions : ['This file is in good shape — no urgent actions needed'];
}

/**
 * Compute ROI estimate in hours: (smell_count * 0.5) + (LOC / 200) + (coupling_score / 20)
 */
export function computeROIEstimate(
  smellCount: number,
  loc: number,
  couplingScore: number
): number {
  return smellCount * 0.5 + loc / 200 + couplingScore / 20;
}
