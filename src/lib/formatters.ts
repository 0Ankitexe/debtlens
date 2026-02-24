/**
 * Format a debt score for display (1 decimal place)
 */
export function formatScore(score: number): string {
  return score.toFixed(1);
}

/**
 * Get CSS class name for a score value
 */
export function getScoreClass(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score < 35) return 'low';
  if (score < 65) return 'medium';
  if (score < 80) return 'high';
  return 'critical';
}

/**
 * Get human-readable score label
 */
export function getScoreLabel(score: number): string {
  if (score < 35) return 'Low Debt';
  if (score < 65) return 'Moderate Debt';
  if (score < 80) return 'High Debt';
  return 'Critical Debt';
}

/**
 * Format a Unix timestamp as a relative time string
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Format a date string from Unix timestamp
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format effort estimate range (hours ±40%)
 */
export function formatEffortRange(hours: number): string {
  const low = Math.round(hours * 0.6);
  const high = Math.round(hours * 1.4);
  if (high <= 1) return '< 1 hour';
  if (low === high) return `~${low} hours`;
  return `${low}–${high} hours`;
}

/**
 * Format a file size in LOC
 */
export function formatLOC(loc: number): string {
  if (loc >= 1000) return `${(loc / 1000).toFixed(1)}k`;
  return `${loc}`;
}

/**
 * Format a component name for display
 */
export function formatComponentName(name: string): string {
  return name
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get the component color CSS variable
 */
export function getComponentColor(name: string): string {
  const colors: Record<string, string> = {
    churn_rate: 'var(--color-churn)',
    code_smell_density: 'var(--color-smells)',
    coupling_index: 'var(--color-coupling)',
    change_coupling: 'var(--color-cochange)',
    test_coverage_gap: 'var(--color-coverage)',
    knowledge_concentration: 'var(--color-knowledge)',
    cyclomatic_complexity: 'var(--color-complexity)',
    decision_staleness: 'var(--color-staleness)',
  };
  return colors[name] || 'var(--accent)';
}
/**
 * Get a human-readable component name
 */
export function getComponentName(key: string): string {
  const names: Record<string, string> = {
    churn_rate: 'Churn Rate',
    code_smell_density: 'Code Smells',
    coupling_index: 'Coupling',
    change_coupling: 'Co-Change',
    test_coverage_gap: 'Coverage Gap',
    knowledge_concentration: 'Knowledge',
    cyclomatic_complexity: 'Complexity',
    decision_staleness: 'Staleness',
  };
  return names[key] ?? formatComponentName(key);
}

/**
 * Format effort hours range
 */
export function formatEffort(low: number, high: number): string {
  if (high <= 1) return '< 1h';
  if (low === high) return `~${low}h`;
  return `${low}–${high}h`;
}
