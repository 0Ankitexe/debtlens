import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="empty-state" style={{ padding: '48px 24px' }}>
      {icon && <span style={{ fontSize: '48px', opacity: 0.5 }}>{icon}</span>}
      <h2>{title}</h2>
      <p style={{ maxWidth: '360px', textAlign: 'center', lineHeight: '1.6' }}>
        {description}
      </p>
      {action && (
        <button className="btn btn-primary" onClick={action.onClick} style={{ marginTop: '8px' }}>
          {action.label}
        </button>
      )}
    </div>
  );
};
