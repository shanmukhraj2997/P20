'use client';

import React from 'react';

export default function LoadingState({ count = 6 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs h-80 flex flex-col justify-between p-4">
          <div className="bg-slate-200 h-40 rounded-xl w-full mb-3"></div>
          <div className="space-y-2">
            <div className="bg-slate-200 h-4 rounded w-3/4"></div>
            <div className="bg-slate-200 h-3 rounded w-1/2"></div>
            <div className="bg-slate-200 h-3 rounded w-full"></div>
          </div>
          <div className="bg-slate-200 h-8 rounded-lg w-full mt-4"></div>
        </div>
      ))}
    </div>
  );
}
