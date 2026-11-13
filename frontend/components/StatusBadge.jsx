'use client';

import React from 'react';

export default function StatusBadge({ status, display }) {
  const getBadgeStyle = (st) => {
    switch (st) {
      case 'available':
      case 'approved':
      case 'confirmed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold';
      case 'checked_in':
        return 'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold';
      case 'completed':
        return 'bg-[#F5F5F5] text-[#111111] border-[#E5E5E5] font-semibold';
      case 'maintenance':
      case 'no_show':
        return 'bg-amber-100/80 text-amber-950 border-amber-300 font-semibold';
      case 'reserved':
        return 'bg-neutral-100 text-[#111111] border-[#E5E5E5] font-semibold';
      case 'pending':
        return 'bg-amber-50 text-amber-900 border border-amber-300 font-semibold';
      case 'cancelled':
      case 'rejected':
      case 'decommissioned':
        return 'bg-rose-50 text-rose-800 border-rose-300 font-semibold';
      default:
        return 'bg-[#F5F5F5] text-[#6B6B6B] border-[#E5E5E5] font-medium';
    }
  };

  const getDotStyle = (st) => {
    switch (st) {
      case 'available':
      case 'approved':
      case 'confirmed':
        return 'bg-emerald-600';
      case 'checked_in':
        return 'bg-emerald-600 animate-pulse';
      case 'completed':
        return 'bg-[#6B6B6B]';
      case 'maintenance':
      case 'no_show':
        return 'bg-amber-600';
      case 'reserved':
        return 'bg-[#111111]';
      case 'pending':
        return 'bg-amber-500';
      case 'cancelled':
      case 'rejected':
      case 'decommissioned':
        return 'bg-rose-600';
      default:
        return 'bg-[#6B6B6B]';
    }
  };

  return (
    <span className={`inline-flex items-center space-x-1.5 text-[11px] px-2.5 py-1 rounded-full border shadow-2xs ${getBadgeStyle(status)}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${getDotStyle(status)}`}></span>
      <span>{display || status}</span>
    </span>
  );
}
