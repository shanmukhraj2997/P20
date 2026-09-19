'use client';

import React from 'react';

export default function StatusBadge({ status, display }) {
  const getBadgeStyle = (st) => {
    switch (st) {
      case 'available':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold';
      case 'maintenance':
        return 'bg-amber-50 text-amber-700 border-amber-200 font-semibold';
      case 'reserved':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold';
      case 'decommissioned':
        return 'bg-slate-100 text-slate-600 border-slate-300 font-semibold';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getDotStyle = (st) => {
    switch (st) {
      case 'available': return 'bg-emerald-500';
      case 'maintenance': return 'bg-amber-500';
      case 'reserved': return 'bg-indigo-500';
      default: return 'bg-slate-400';
    }
  };

  return (
    <span className={`inline-flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-full border shadow-2xs ${getBadgeStyle(status)}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${getDotStyle(status)}`}></span>
      <span>{display || status}</span>
    </span>
  );
}
