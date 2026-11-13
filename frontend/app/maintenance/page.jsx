'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import ConfirmModal from '@/components/ConfirmModal';
import { api } from '@/lib/api';

export default function MaintenancePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [windows, setWindows] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Filters
  const [kindFilter, setKindFilter] = useState('all');
  const [resourceFilter, setResourceFilter] = useState('all');

  // Create Window Modal & Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [formResource, setFormResource] = useState('');
  const [formKind, setFormKind] = useState('maintenance');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Conflict Overlap Resolution Modal State
  const [conflictData, setConflictData] = useState(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);

  // Delete Window Confirmation State
  const [deletingWindow, setDeletingWindow] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const isStaff = user && (
    ['custodian', 'facility_mgr', 'admin'].includes(user.role) || user.is_superuser
  );
  const isGlobalStaff = user && (
    ['facility_mgr', 'admin'].includes(user.role) || user.is_superuser
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const fetchData = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    setError(null);
    try {
      const [windowsData, resData] = await Promise.all([
        api.maintenance.list(),
        api.resources.list().catch(() => []),
      ]);
      setWindows(windowsData);
      setResources(resData);
    } catch (err) {
      setError(err.message || 'Failed to load maintenance schedules.');
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    if (isStaff) {
      fetchData();
    }
  }, [isStaff, fetchData]);

  // Handle Form Submission
  const handleScheduleSubmit = async (e, forceCancel = false) => {
    if (e) e.preventDefault();
    setSubmitting(true);
    setCreateError(null);

    const payload = {
      resource: formResource ? parseInt(formResource, 10) : null,
      kind: formKind,
      start_datetime: formStart,
      end_datetime: formEnd,
      reason: formReason.trim(),
      notes: formNotes.trim(),
      cancel_conflicting: forceCancel,
    };

    try {
      const resp = await api.maintenance.create(payload);
      setActionSuccess(
        resp.cancelled_count && resp.cancelled_count > 0
          ? `Maintenance scheduled. ${resp.cancelled_count} conflicting reservation(s) were automatically cancelled.`
          : 'Maintenance window scheduled successfully!'
      );
      setShowCreateModal(false);
      setConflictData(null);
      resetForm();
      fetchData();
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err) {
      if (err.status === 409 && err.data?.conflicting_bookings) {
        // Overlap detected: present conflict resolution modal
        setConflictData(err.data);
      } else {
        setCreateError(err.message || 'Failed to schedule maintenance.');
      }
    } finally {
      setSubmitting(false);
      setResolvingConflict(false);
    }
  };

  const confirmCancelConflicting = async () => {
    setResolvingConflict(true);
    await handleScheduleSubmit(null, true);
  };

  const resetForm = () => {
    setFormResource('');
    setFormKind('maintenance');
    setFormStart('');
    setFormEnd('');
    setFormReason('');
    setFormNotes('');
    setCreateError(null);
  };

  const handleDelete = async () => {
    if (!deletingWindow) return;
    setDeleteLoading(true);
    try {
      await api.maintenance.delete(deletingWindow.id);
      setActionSuccess(`Maintenance schedule #${deletingWindow.id} deleted.`);
      setDeletingWindow(null);
      fetchData();
      setTimeout(() => setActionSuccess(null), 3500);
    } catch (err) {
      alert(err.message || 'Failed to delete maintenance window.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoString;
    }
  };

  const getWindowTimingStatus = (startStr, endStr) => {
    const now = new Date();
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (now >= start && now <= end) return 'active';
    if (now < start) return 'upcoming';
    return 'past';
  };

  // Filter windows
  const filteredWindows = windows.filter((w) => {
    if (kindFilter !== 'all' && w.kind !== kindFilter) return false;
    if (resourceFilter !== 'all') {
      if (resourceFilter === 'campus' && w.resource !== null) return false;
      if (resourceFilter !== 'campus' && String(w.resource) !== resourceFilter) return false;
    }
    return true;
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-[#6B6B6B] text-sm">
        Authenticating session...
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col font-sans">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 p-6 md:p-10 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl border border-[#E5E5E5] text-center max-w-md shadow-xs">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl border border-rose-200">
                ✕
              </div>
              <h2 className="text-lg font-bold text-[#111111] mb-2">Access Restricted</h2>
              <p className="text-xs text-[#6B6B6B]">
                Maintenance and downtime management is restricted to resource custodians, facility managers, and campus administrators.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col font-sans">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full space-y-6">
          {/* Header Banner */}
          <div className="bg-[#111111] border border-[#222222] rounded-3xl p-6 md:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center space-x-2 bg-[#F58220]/20 text-[#F58220] px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border border-[#F58220]/30">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                <span>Module M7 • Maintenance & Downtime</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                Maintenance & Resource Downtime
              </h1>
              <p className="text-white/70 text-xs md:text-sm max-w-2xl leading-relaxed">
                Schedule preventative servicing, facility overhauls, and campus blackout periods. Active windows automatically update resource availability and protect lab equipment.
              </p>
            </div>

            <button
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              className="px-5 py-3 bg-[#F58220] hover:bg-[#D96A0B] active:scale-98 text-white text-xs font-bold rounded-2xl shadow-lg transition-all flex items-center space-x-2 shrink-0 self-start md:self-auto focus:ring-2 focus:ring-[#F58220] cursor-pointer"
              id="schedule-maintenance-btn"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              <span>Schedule Downtime</span>
            </button>
          </div>

          {/* Success Notification */}
          {actionSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs flex items-start space-x-3 shadow-2xs">
              <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div className="font-semibold">{actionSuccess}</div>
            </div>
          )}

          {/* Filters Bar */}
          <div className="bg-white rounded-2xl border border-[#E5E5E5] p-4 shadow-2xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-[#6B6B6B]">Kind:</span>
                <select
                  value={kindFilter}
                  onChange={(e) => setKindFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                >
                  <option value="all">All Types</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="downtime">Emergency Downtime</option>
                  <option value="holiday">Campus Holiday</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-[#6B6B6B]">Scope:</span>
                <select
                  value={resourceFilter}
                  onChange={(e) => setResourceFilter(e.target.value)}
                  className="px-3 py-1.5 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                >
                  <option value="all">All Resources</option>
                  <option value="campus">Campus-Wide Only</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-xs font-semibold text-[#6B6B6B]">
              Showing {filteredWindows.length} scheduled window(s)
            </div>
          </div>

          {/* Windows List */}
          {loading ? (
            <LoadingState count={4} />
          ) : error ? (
            <ErrorState error={error} onRetry={fetchData} />
          ) : filteredWindows.length === 0 ? (
            <EmptyState
              message={
                kindFilter !== 'all' || resourceFilter !== 'all'
                  ? 'No maintenance schedules matching the selected filter criteria.'
                  : 'No maintenance or downtime windows are currently scheduled.'
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredWindows.map((w) => {
                const timingStatus = getWindowTimingStatus(w.start_datetime, w.end_datetime);
                const isCampusWide = !w.resource;

                return (
                  <div
                    key={w.id}
                    className={`bg-white rounded-2xl border p-5 shadow-2xs transition-all flex flex-col justify-between space-y-4 ${
                      timingStatus === 'active'
                        ? 'border-amber-400 bg-amber-50/20'
                        : 'border-[#E5E5E5] hover:border-[#F58220]'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                            w.kind === 'maintenance'
                              ? 'bg-amber-50 text-amber-900 border-amber-300'
                              : w.kind === 'downtime'
                              ? 'bg-rose-50 text-rose-800 border-rose-300'
                              : 'bg-[#F5F5F5] text-[#111111] border-[#E5E5E5]'
                          }`}
                        >
                          {w.kind_display}
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            timingStatus === 'active'
                              ? 'bg-amber-500 text-white animate-pulse'
                              : timingStatus === 'upcoming'
                              ? 'bg-[#FFF3E6] text-[#D96A0B] border border-[#F58220]/30'
                              : 'bg-[#F5F5F5] text-[#6B6B6B] border border-[#E5E5E5]'
                          }`}
                        >
                          {timingStatus === 'active' ? 'Active Now' : timingStatus === 'upcoming' ? 'Upcoming' : 'Past'}
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-[#111111] leading-snug">{w.reason}</h3>

                      <div className="text-xs text-[#6B6B6B] space-y-1">
                        <div className="flex items-center space-x-1.5 font-medium text-[#111111]">
                          <svg className="w-4 h-4 text-[#6B6B6B] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                          <span className={isCampusWide ? 'text-[#F58220] font-bold' : ''}>
                            {w.resource_name}
                          </span>
                        </div>

                        <div className="text-[11px] text-[#6B6B6B]">
                          <div><strong>From:</strong> {formatDateTime(w.start_datetime)}</div>
                          <div><strong>To:</strong> {formatDateTime(w.end_datetime)}</div>
                        </div>
                      </div>

                      {w.notes && (
                        <p className="text-xs text-[#111111] bg-[#F5F5F5] p-2.5 rounded-xl border border-[#E5E5E5] italic">
                          "{w.notes}"
                        </p>
                      )}

                      <div className="text-[10px] text-[#6B6B6B] pt-1 border-t border-[#E5E5E5]">
                        Scheduled by {w.created_by_name}
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-end">
                      <button
                        onClick={() => setDeletingWindow(w)}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-300 hover:border-transparent text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Remove Schedule
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Schedule Window Modal */}
          {showCreateModal && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-[#111111]/70 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-[#E5E5E5] overflow-hidden transform transition-all">
                <div className="bg-[#111111] border-b border-[#222222] p-6 text-white flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-white">Schedule Maintenance / Downtime</h2>
                    <p className="text-xs text-[#6B6B6B]">Configure blackout window and equipment servicing</p>
                  </div>
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={(e) => handleScheduleSubmit(e, false)} className="p-6 space-y-4">
                  {createError && (
                    <div className="p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs font-semibold">
                      {createError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Target Resource <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={formResource}
                      onChange={(e) => setFormResource(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                    >
                      {isGlobalStaff && (
                        <option value="">Campus-Wide (All Resources & Facilities)</option>
                      )}
                      {resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.location})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Downtime Classification <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={formKind}
                      onChange={(e) => setFormKind(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                    >
                      <option value="maintenance">Maintenance (Scheduled Servicing & Upgrades)</option>
                      <option value="downtime">Emergency Downtime (Breakdowns, Repairs)</option>
                      <option value="holiday">Campus Holiday (University Holiday Blackout)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#111111] mb-1">
                        Start Time <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={formStart}
                        onChange={(e) => setFormStart(e.target.value)}
                        className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#111111] mb-1">
                        End Time <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="datetime-local"
                        required
                        value={formEnd}
                        onChange={(e) => setFormEnd(e.target.value)}
                        className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Reason / Title <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Laser Cutter Annual Calibration"
                      value={formReason}
                      onChange={(e) => setFormReason(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Operational Notes & Instructions (Optional)
                    </label>
                    <textarea
                      rows="3"
                      placeholder="Additional details for department heads and campus attendees..."
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                    ></textarea>
                  </div>

                  <div className="pt-3 flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(false)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-[#111111] text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 px-4 py-2.5 bg-[#F58220] hover:bg-[#D96A0B] disabled:bg-[#E5E5E5] disabled:text-[#6B6B6B] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center space-x-1.5 focus:ring-2 focus:ring-[#F58220] cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Scheduling...</span>
                        </>
                      ) : (
                        <span>Confirm Schedule</span>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Conflicting Bookings Overlap Modal */}
          {conflictData && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-[#111111]/70 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-rose-300 overflow-hidden transform transition-all">
                <div className="bg-rose-700 p-6 text-white flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">Conflicting Bookings Detected</h2>
                      <p className="text-xs text-rose-100">
                        {conflictData.count || conflictData.conflicting_bookings?.length} active booking(s) overlap this proposed window
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <p className="text-xs text-[#6B6B6B] leading-relaxed">
                    This downtime window overlaps with existing approved campus reservations. To proceed, you can cancel these conflicting bookings with an official notice and immediately release their PostgreSQL reservation slots.
                  </p>

                  <div className="max-h-60 overflow-y-auto space-y-2 border border-[#E5E5E5] rounded-xl p-3 bg-[#F5F5F5]">
                    {(conflictData.conflicting_bookings || conflictData.affected_bookings || []).map((b) => (
                      <div key={b.id} className="bg-white p-3 rounded-lg border border-[#E5E5E5] text-xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-[#111111]">
                          <span>Booking #{b.id} • {b.resource_name}</span>
                          <span className="text-[10px] bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full uppercase">
                            {b.status}
                          </span>
                        </div>
                        <div className="text-[#111111] text-[11px]">
                          <strong>Requester:</strong> {b.requester_name}
                        </div>
                        <div className="text-[#6B6B6B] text-[11px]">
                          <strong>Time:</strong> {formatDateTime(b.start_time)} – {formatDateTime(b.end_time)}
                        </div>
                        {b.purpose && (
                          <div className="text-[#6B6B6B] italic text-[11px]">"{b.purpose}"</div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex items-center space-x-3">
                    <button
                      type="button"
                      onClick={() => setConflictData(null)}
                      className="flex-1 px-4 py-2.5 rounded-xl border border-[#111111] text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] cursor-pointer"
                    >
                      Change Window Time
                    </button>
                    <button
                      type="button"
                      disabled={resolvingConflict}
                      onClick={confirmCancelConflicting}
                      className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-[#E5E5E5] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      {resolvingConflict ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Cancelling...</span>
                        </>
                      ) : (
                        <span>Cancel Conflicts & Proceed</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          <ConfirmModal
            isOpen={Boolean(deletingWindow)}
            title="Delete Maintenance Schedule?"
            message={
              deletingWindow
                ? `Are you sure you want to remove the ${deletingWindow.kind_display} schedule for "${deletingWindow.resource_name}"? Resource availability will be restored for bookings.`
                : ''
            }
            confirmText="Yes, Delete Schedule"
            cancelText="Keep Schedule"
            danger={true}
            loading={deleteLoading}
            onConfirm={handleDelete}
            onCancel={() => setDeletingWindow(null)}
          />
        </main>
      </div>
    </div>
  );
}
