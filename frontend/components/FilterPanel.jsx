'use client';

import React from 'react';

export default function FilterPanel({
  types = [],
  selectedType,
  onTypeChange,
  selectedStatus,
  onStatusChange,
  minCapacity,
  onMinCapacityChange,
  onReset
}) {
  const hasActiveFilters = selectedType || selectedStatus || minCapacity;

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center space-x-1.5">
          <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filter Resources</span>
        </h3>

        {hasActiveFilters && (
          <button
            onClick={onReset}
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline transition-colors"
          >
            Reset Filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Resource Type Dropdown */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 mb-1">Resource Category</label>
          <select
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            id="filter-type-select"
          >
            <option value="">All Categories</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Operational Status */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 mb-1">Status</label>
          <select
            value={selectedStatus}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            id="filter-status-select"
          >
            <option value="">All Statuses</option>
            <option value="available">Available</option>
            <option value="maintenance">Under Maintenance</option>
            <option value="reserved">Reserved</option>
          </select>
        </div>

        {/* Min Capacity */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 mb-1">Min Capacity</label>
          <input
            type="number"
            min="1"
            placeholder="e.g. 20"
            value={minCapacity}
            onChange={(e) => onMinCapacityChange(e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            id="filter-capacity-input"
          />
        </div>
      </div>
    </div>
  );
}
