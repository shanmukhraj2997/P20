'use client';

import React, { useEffect, useState, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import StatusBadge from '@/components/StatusBadge';
import ResourceFormModal from '@/components/ResourceFormModal';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function ResourceDetailsPage({ params }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [resource, setResource] = useState(null);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    api.resourceTypes().then(setTypes).catch(() => {});
  }, []);

  const loadResource = () => {
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
  };

  useEffect(() => {
    loadResource();
  }, [user, id]);

  const handleStatusChange = async (newStatus) => {
    setUpdatingStatus(true);
    try {
      const updated = await api.resources.update(id, { status: newStatus });
      setResource(updated);
      setToastMsg(`Status updated to "${updated.status_display}".`);
      setTimeout(() => setToastMsg(null), 3000);
    } catch (err) {
      alert(err.message || 'Failed to update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const isCustodianOrAdmin = user && (
    user.role === 'admin' ||
    user.role === 'facility_mgr' ||
    user.is_superuser ||
    (resource && (resource.custodian === user.id || resource.custodian_name === user.username))
  );

  const fallbackImage = 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80';

  if (authLoading || (!user && loading)) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-[#6B6B6B] text-sm">
        Loading resource details...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between">
            <Link
              href="/resources"
              className="inline-flex items-center space-x-2 text-xs font-semibold text-[#111111] hover:text-[#F58220] bg-white px-3.5 py-2 rounded-xl border border-[#E5E5E5] hover:border-[#F58220] shadow-2xs transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Catalogue</span>
            </Link>

            <span className="text-xs text-[#6B6B6B] font-mono">Resource ID: #{id}</span>
          </div>

          {toastMsg && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold shadow-2xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{toastMsg}</span>
              </div>
              <button onClick={() => setToastMsg(null)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer">Dismiss</button>
            </div>
          )}

          {loading ? (
            <div className="bg-white rounded-2xl p-12 border border-[#E5E5E5] text-center animate-pulse">
              <div className="bg-[#E5E5E5] h-64 rounded-xl w-full mb-6"></div>
              <div className="bg-[#E5E5E5] h-6 rounded w-1/2 mx-auto mb-3"></div>
              <div className="bg-[#E5E5E5] h-4 rounded w-3/4 mx-auto"></div>
            </div>
          ) : error || !resource ? (
            <div className="bg-rose-50 rounded-2xl p-10 text-center border border-rose-300">
              <h3 className="text-base font-bold text-rose-900">Resource Not Found</h3>
              <p className="text-xs text-rose-700 mt-1">{error || 'The requested resource does not exist or has been removed.'}</p>
              <Link href="/resources" className="mt-4 inline-block px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-lg">
                Return to Catalogue
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Main Detail Header Card */}
              <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-2xs overflow-hidden">
                <div className="relative h-72 md:h-80 w-full bg-[#111111]">
                  <img
                    src={resource.image_url || fallbackImage}
                    alt={resource.name}
                    className="w-full h-full object-cover opacity-90"
                    onError={(e) => { e.target.src = fallbackImage; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/40 to-transparent"></div>

                  <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="bg-[#F58220] text-white text-[11px] font-bold px-2.5 py-0.5 rounded-md">
                          {resource.resource_type_detail?.name || 'Campus Resource'}
                        </span>
                        <StatusBadge status={resource.status} display={resource.status_display} />
                      </div>
                      <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">{resource.name}</h1>
                      <div className="flex items-center space-x-4 text-xs text-white/80 mt-2">
                        <span className="flex items-center space-x-1">
                          <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          <span>{resource.location}</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                          </svg>
                          <span>Max Capacity: {resource.capacity} People</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      {isCustodianOrAdmin && (
                        <button
                          onClick={() => setShowEditModal(true)}
                          className="px-4 py-3 bg-white/20 hover:bg-white/30 text-white text-xs font-bold rounded-xl backdrop-blur-md border border-white/30 transition-all flex items-center space-x-1.5 cursor-pointer"
                          id="edit-resource-btn"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          <span>Edit Details</span>
                        </button>
                      )}

                      <Link
                        href={`/resources/${id}/availability`}
                        className="px-5 py-3 bg-[#F58220] hover:bg-[#D96A0B] text-white text-xs font-bold rounded-xl shadow-lg shadow-orange-500/20 transition-all flex items-center justify-center space-x-2 border border-orange-400/30"
                        id="view-availability-btn"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Check Availability & Book &rarr;</span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* Custodian Management Bar */}
              {isCustodianOrAdmin && (
                <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                    <span className="text-xs font-bold text-amber-950">Custodian Management Console:</span>
                    <span className="text-xs text-amber-900">Quickly toggle operational status for this campus facility</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-semibold text-amber-950">Status:</span>
                    <select
                      value={resource.status}
                      disabled={updatingStatus}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#F58220] disabled:opacity-50"
                      id="custodian-status-select"
                    >
                      <option value="available">Available</option>
                      <option value="maintenance">Under Maintenance</option>
                      <option value="reserved">Reserved</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Two Column Grid for Specifications & Features */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1 & 2: Overview & Features */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Description Box */}
                  <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs">
                    <h3 className="text-sm font-bold text-[#111111] mb-2 uppercase tracking-wider text-xs">
                      Resource Description & Usage Rules
                    </h3>
                    <p className="text-xs text-[#6B6B6B] leading-relaxed whitespace-pre-line">
                      {resource.description}
                    </p>
                  </div>

                  {/* Features & Equipment List */}
                  <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs">
                    <h3 className="text-sm font-bold text-[#111111] mb-3 uppercase tracking-wider text-xs">
                      Included Equipment & Facility Features
                    </h3>
                    {resource.features && resource.features.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {resource.features.map((feat, idx) => (
                          <div key={idx} className="flex items-center space-x-2 p-2.5 bg-[#F5F5F5] rounded-xl border border-[#E5E5E5] text-xs text-[#111111]">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span className="font-medium">{feat}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#6B6B6B] italic">No specific features listed for this resource.</p>
                    )}
                  </div>
                </div>

                {/* Column 3: Resource Specs & Custodian Contact Card */}
                <div className="space-y-6">
                  {/* Resource Specifications Box */}
                  <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs">
                    <h3 className="text-xs font-bold text-[#111111] uppercase tracking-wider mb-4">
                      Resource Specifications
                    </h3>

                    <div className="space-y-3.5 text-xs">
                      <div className="flex justify-between py-1.5 border-b border-[#E5E5E5]">
                        <span className="text-[#6B6B6B]">Category Type</span>
                        <span className="font-semibold text-[#111111]">{resource.resource_type_detail?.name}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-[#E5E5E5]">
                        <span className="text-[#6B6B6B]">Maximum Capacity</span>
                        <span className="font-semibold text-[#111111]">{resource.capacity} Seats</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-[#E5E5E5]">
                        <span className="text-[#6B6B6B]">Physical Location</span>
                        <span className="font-semibold text-[#111111] text-right max-w-[180px]">{resource.location}</span>
                      </div>
                      <div className="flex justify-between py-1.5 border-b border-[#E5E5E5]">
                        <span className="text-[#6B6B6B]">Operational Status</span>
                        <StatusBadge status={resource.status} display={resource.status_display} />
                      </div>
                    </div>
                  </div>

                  {/* Resource Custodian Contact Card */}
                  <div className="bg-[#111111] text-white p-6 rounded-2xl border border-[#222222] shadow-lg">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#F58220] mb-2">
                      Resource Custodian
                    </div>
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-[#F58220] text-white font-bold flex items-center justify-center text-sm uppercase">
                        {resource.custodian_name ? resource.custodian_name[0] : 'C'}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-white">{resource.custodian_name}</div>
                        <div className="text-[11px] text-white/70">Campus Facilities In-Charge</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-white/80 pt-3 border-t border-[#222222]">
                      {resource.custodian_email && (
                        <div className="flex items-center space-x-2">
                          <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          <span className="truncate">{resource.custodian_email}</span>
                        </div>
                      )}
                      {resource.custodian_phone && (
                        <div className="flex items-center space-x-2">
                          <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span>{resource.custodian_phone}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Custodian Edit Modal */}
              <ResourceFormModal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                resource={resource}
                types={types}
                onSuccess={(updated) => {
                  setResource(updated);
                  setToastMsg(`Resource "${updated.name}" updated successfully!`);
                  setTimeout(() => setToastMsg(null), 3000);
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
