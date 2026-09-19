'use client';

import React from 'react';

export default function ErrorState({ error, onRetry }) {
  return (
    <div className="bg-red-50 rounded-2xl border border-red-200 p-8 text-center max-w-md mx-auto my-8">
      <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-3">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h4 className="text-sm font-bold text-red-900">Failed to Load Resources</h4>
      <p className="text-xs text-red-700 mt-1">{error || 'Unable to connect to Django REST API server.'}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-all"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
