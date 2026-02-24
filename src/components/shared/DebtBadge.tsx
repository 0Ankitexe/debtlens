import React from 'react';

interface DebtBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
}

export const DebtBadge: React.FC<DebtBadgeProps> = ({ score, size = 'md' }) => {
  const className = getScoreClass(score);
  const sizeStyles = {
    sm: { fontSize: '9px', padding: '1px 4px' },
    md: { fontSize: '11px', padding: '2px 6px' },
    lg: { fontSize: '13px', padding: '3px 8px' },
  };

  return (
    <span
      className={`score-badge badge-${className}`}
      style={{
        ...sizeStyles[size],
        borderRadius: '4px',
        color: 'white',
        fontFamily: 'var(--font-mono)',
        fontWeight: 700,
      }}
    >
      {score.toFixed(1)}
    </span>
  );
};

function getScoreClass(score: number): string {
  if (score < 35) return 'low';
  if (score < 65) return 'medium';
  if (score < 80) return 'high';
  return 'critical';
}
