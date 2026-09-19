'use client';

import React from 'react';
import Link from 'next/link';
import StatusBadge from '@/components/StatusBadge';

export default function ResourceCard({ resource }) {
  const fallbackImage = 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80';

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-2xs hover:shadow-md transition-all duration-200 flex flex-col group">
      {/* Resource Image & Status Overlay */}
      <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
        <img
          src={resource.image_url || fallbackImage}
          alt={resource.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { e.target.src = fallbackImage; }}
        />
        <div className="absolute top-3 right-3">
          <StatusBadge status={resource.status} display={resource.status_display} />
        </div>
        <div className="absolute bottom-3 left-3">
          <span className="bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-semibold px-2.5 py-1 rounded-md border border-slate-700/50">
            {resource.resource_type_name || 'Campus Resource'}
          </span>
        </div>
      </div>

      {/* Resource Details Body */}
      <div className="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors line-clamp-1">
            {resource.name}
          </h3>

          <div className="flex items-center space-x-3 text-xs text-slate-500 mt-2">
            <div className="flex items-center space-x-1 truncate">
              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{resource.location}</span>
            </div>

            <div className="flex items-center space-x-1 shrink-0">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Cap: {resource.capacity}</span>
            </div>
          </div>

          {/* Feature Tags Preview */}
          {resource.features && resource.features.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {resource.features.slice(0, 3).map((feat, idx) => (
                <span key={idx} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium border border-slate-200/60">
                  {feat}
                </span>
              ))}
              {resource.features.length > 3 && (
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">
                  +{resource.features.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Custodian: <strong className="text-slate-600 font-medium">{resource.custodian_name}</strong></span>
          <Link
            href={`/resources/${resource.id}`}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white text-xs font-bold rounded-lg transition-all border border-indigo-200/60 hover:border-transparent"
            id={`view-resource-${resource.id}`}
          >
            View Details &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
