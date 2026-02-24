import React from 'react';
import { useDebtStore } from '../../store/debtStore';
import { DebtHeatmap } from '../heatmap/DebtHeatmap';
import { FixThisFirst } from '../priority/FixThisFirst';
import { DebtTimeline } from '../timeline/DebtTimeline';
import { DebtRegister } from '../register/DebtRegister';
import { DebtBudget } from '../budget/DebtBudget';
import { Settings } from '../settings/Settings';

export const MainContent: React.FC = () => {
  const activeView = useDebtStore((s) => s.activeView);

  return (
    <div className="main-content" style={{ position: 'relative', overflow: 'hidden' }}>
      {activeView === 'heatmap' && <DebtHeatmap />}
      {activeView === 'fixfirst' && <FixThisFirst />}
      {activeView === 'timeline' && <DebtTimeline />}
      {activeView === 'register' && <DebtRegister />}
      {activeView === 'budget' && <DebtBudget />}
      {activeView === 'settings' && <Settings />}
    </div>
  );
};
