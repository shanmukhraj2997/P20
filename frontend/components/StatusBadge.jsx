'use client';

import React from 'react';

export default function StatusBadge({ status, display }) {
  const getBadgeStyle = (st) => {
    switch (st) {
      case 'available':
      case 'approved':
      case 'confirmed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold';
      case 'checked_in':
        return 'bg-teal-50 text-teal-800 border-teal-300 font-bold';
      case 'completed':
        return 'bg-blue-50 text-blue-700 border-blue-200 font-semibold';
      case 'maintenance':
      case 'no_show':
        return 'bg-amber-50 text-amber-800 border-amber-300 font-semibold';
      case 'reserved':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200 font-semibold';
      case 'pending':
        return 'bg-sky-50 text-sky-700 border-sky-200 font-semibold';
      case 'cancelled':
      case 'rejected':
      case 'decommissioned':
        return 'bg-rose-50 text-rose-700 border-rose-200 font-semibold';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getDotStyle = (st) => {
    switch (st) {
      case 'available':
      case 'approved':
      case 'confirmed':
        return 'bg-emerald-500';
      case 'checked_in':
        return 'bg-teal-500 animate-pulse';
      case 'completed':
        return 'bg-blue-500';
      case 'maintenance':
      case 'no_show':
        return 'bg-amber-500';
      case 'reserved':
        return 'bg-indigo-500';
      case 'pending':
        return 'bg-sky-500';
      case 'cancelled':
      case 'rejected':
      case 'decommissioned':
        return 'bg-rose-500';
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <span className={`inline-flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-full border shadow-2xs ${getBadgeStyle(status)}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${getDotStyle(status)}`}></span>
      <span>{display || status}</span>
    </span>
  );
}
