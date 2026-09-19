'use client';

import React, { useEffect, useState, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import StatusBadge from '@/components/StatusBadge';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function ResourceDetailsPage({ params }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAvailabilityNotice, setShowAvailabilityNotice] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user && id) {
      setLoading(true);
      api.resources.get(id)
        .then((data) => {
          setResource(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message || 'Failed to load resource details.');
          setLoading(false);
        });
    }
  }, [user, id]);

  const fallbackImage = 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80';

  if (authLoading || (!user && loading)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Loading resource details...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between">
            <Link
              href="/resources"
              className="inline-flex items-center space-x-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Catalogue</span>
            </Link>

            <span className="text-xs text-slate-400 font-mono">Resource ID: #{id}</span>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center animate-pulse">
              <div className="bg-slate-200 h-64 rounded-xl w-full mb-6"></div>
              <div className="bg-slate-200 h-6 rounded w-1/2 mx-auto mb-3"></div>
              <div className="bg-slate-200 h-4 rounded w-3/4 mx-auto"></div>
            </div>
          ) : error || !resource ? (
            <div className="bg-red-50 rounded-2xl p-10 text-center border border-red-200">
              <h3 className="text-base font-bold text-red-900">Resource Not Found</h3>
              <p className="text-xs text-red-700 mt-1">{error || 'The requested resource does not exist or has been removed.'}</p>
              <Link href="/resources" className="mt-4 inline-block px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg">
                Return to Catalogue
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Main Detail Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="relative h-72 md:h-80 w-full bg-slate-900">
                  <img
                    src={resource.image_url || fallbackImage}
                    alt={resource.name}
                    className="w-full h-full object-cover opacity-90"
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent"></div>

                  <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="bg-indigo-600 text-white text-[11px] font-bold px-2.5 py-0.5 rounded-md">
                          {resource.resource_type_detail?.name || 'Campus Resource'}
                        </span>
                        <StatusBadge status={resource.status} display={resource.status_display} />
                      </div>
                      <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{resource.name}</h1>
                      <div className="flex items-center space-x-4 text-xs text-slate-300 mt-2">
                        <span className="flex items-center space-x-1">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          <span>{resource.location}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                          <span>Max Capacity: {resource.capacity} People</span>
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setShowAvailabilityNotice(!showAvailabilityNotice)}
                      className="px-5 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center space-x-2 border border-indigo-400/30"
                      id="view-availability-btn"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>View Availability</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Sprint 3 Preview Availability Alert */}
              {showAvailabilityNotice && (
                <div className="bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 border-2 border-indigo-500/40 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Sprint 3 Conflict-Safe Booking Engine Preview</h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Resource <strong>{resource.name}</strong> is catalogued and active. The database-level range exclusion booking engine (`EXCLUDE USING gist`) and real-time FullCalendar availability schedule will be enabled in <strong>Sprint 3</strong>.
                      </p>
                      <div className="mt-3 flex items-center space-x-3 text-[11px] font-mono text-indigo-700">
                        <span className="bg-indigo-100 px-2 py-0.5 rounded font-semibold">PostgreSQL btree_gist Ready</span>
                        <span>•</span>
                        <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">Status: {resource.status_display}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Two Column Grid for Specifications & Features */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1 & 2: Overview & Features */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Description Box */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-2 uppercase tracking-wider text-xs">
                      Resource Description & Usage Rules
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                      {resource.description}
                    </p>
                  </div>

                  {/* Features & Equipment List */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
                    <h3 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider text-xs">
                      Included Equipment & Facility Features
                    </h3>
                    {resource.features && resource.features.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {resource.features.map((feat, idx) => (
                          <div key={idx} className="flex items-center space-x-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 text-xs text-slate-700">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span className="font-medium">{feat}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic">No specific features listed for this resource.</p>
                    )}
                  </div>
                </div>

                {/* Column 3: Resource Specs & Custodian Contact Card */}
                <div className="space-y-6">
                  {/* Resource Specifications Box */}
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">
                      Resource Specifications
                    </h3>

                    <div className="space-y-3.5 text-xs">
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500">Category Type</span>
                        <span className="font-semibold text-slate-900">{resource.resource_type_detail?.name}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500">Maximum Capacity</span>
                        <span className="font-semibold text-slate-900">{resource.capacity} Seats</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500">Physical Location</span>
                        <span className="font-semibold text-slate-900 text-right max-w-[180px]">{resource.location}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-slate-100">
                        <span className="text-slate-500">Operational Status</span>
                        <StatusBadge status={resource.status} display={resource.status_display} />
                      </div>
                    </div>
                  </div>

                  {/* Resource Custodian Contact Card */}
                  <div className="bg-gradient-to-br from-slate-900 to-slate-950 text-white p-6 rounded-2xl border border-slate-800 shadow-lg">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-2">
                      Resource Custodian
                    </div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm uppercase">
                        {resource.custodian_name ? resource.custodian_name[0] : 'C'}
                      </div>
                      <div>
                        <div className="text-sm font-bold">{resource.custodian_name}</div>
                        <div className="text-[11px] text-slate-400">Campus Facilities In-Charge</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-300 pt-3 border-t border-slate-800">
                      {resource.custodian_email && (
                        <div className="flex items-center space-x-2">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{resource.custodian_email}</span>
                        </div>
                      )}
                      {resource.custodian_phone && (
                        <div className="flex items-center space-x-2">
                          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span>{resource.custodian_phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
