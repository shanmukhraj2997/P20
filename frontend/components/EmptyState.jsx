'use client';

import React from 'react';

export default function EmptyState({ message = 'No resources found matching your search criteria.', onReset }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-8 shadow-2xs">
      <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <h4 className="text-sm font-bold text-slate-800">No Resources Found</h4>
      <p className="text-xs text-slate-500 mt-1">{message}</p>
      {onReset && (
        <button
          onClick={onReset}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all"
        >
          Reset Search Filters
        </button>
      )}
    </div>
  );
}
