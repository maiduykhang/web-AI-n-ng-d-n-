
import React from 'react';

type CardStatus = 'good' | 'warn' | 'bad';

interface DataCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit: string;
  status: CardStatus;
}

const DataCard: React.FC<DataCardProps> = ({ icon, label, value, unit, status }) => {
  const statusClasses: Record<CardStatus, string> = {
    good: 'border-green-500',
    warn: 'border-yellow-400',
    bad: 'border-red-500',
  };

  return (
    <div className={`bg-white p-3.5 rounded-xl text-center shadow-md border-l-4 transition-transform hover:-translate-y-1 ${statusClasses[status]}`}>
      <div className="text-2xl text-slate-600">{icon}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
      <div className="text-2xl font-bold text-slate-800 my-1">{value}</div>
      <div className="text-xs text-slate-500">{unit}</div>
    </div>
  );
};

export default DataCard;
