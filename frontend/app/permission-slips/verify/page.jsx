'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import StatusBadge from '@/components/StatusBadge';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function PermissionSlipVerificationPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [slips, setSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Action Modals State
  const [verifySlipModal, setVerifySlipModal] = useState(null);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [rejectSlipModal, setRejectSlipModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [allocateSlipModal, setAllocateSlipModal] = useState(null);
  const [conflictsData, setConflictsData] = useState(null);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [overrideConflicting, setOverrideConflicting] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const isAuthorized = user && (['dept_head', 'facility_mgr', 'admin'].includes(user.role) || user.is_superuser);
  const canOverrideRole = user && (['facility_mgr', 'admin'].includes(user.role) || user.is_superuser);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const fetchSlips = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();
      const data = await api.permissionSlips.list(params);
      setSlips(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch slips for verification.');
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, statusFilter, searchQuery]);

  useEffect(() => {
    if (isAuthorized) {
      fetchSlips();
    }
  }, [isAuthorized, fetchSlips]);

  // Mark Under Review
  const handleMarkUnderReview = async (slip) => {
    setActionSubmitting(true);
    setFeedback(null);
    try {
      await api.permissionSlips.review(slip.id);
      setFeedback({
        type: 'success',
        message: `Permission Slip [${slip.reference_number}] moved to Under Review.`
      });
      fetchSlips();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Action failed.' });
    } finally {
      setActionSubmitting(false);
    }
  };

  // Confirm Verification
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    if (!verifySlipModal) return;
    setActionSubmitting(true);
    setFeedback(null);
    try {
      await api.permissionSlips.verify(verifySlipModal.id, verifyNotes.trim());
      setFeedback({
        type: 'success',
        message: `Permission Slip [${verifySlipModal.reference_number}] officially verified and approved for room allocation.`
      });
      setVerifySlipModal(null);
      setVerifyNotes('');
      fetchSlips();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Verification failed.' });
    } finally {
      setActionSubmitting(false);
    }
  };

  // Confirm Rejection
  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!rejectSlipModal) return;
    if (!rejectReason.trim()) {
      alert('Mandatory rejection reason required.');
      return;
    }
    setActionSubmitting(true);
    setFeedback(null);
    try {
      await api.permissionSlips.reject(rejectSlipModal.id, rejectReason.trim());
      setFeedback({
        type: 'success',
        message: `Permission Slip [${rejectSlipModal.reference_number}] rejected.`
      });
      setRejectSlipModal(null);
      setRejectReason('');
      fetchSlips();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Rejection failed.' });
    } finally {
      setActionSubmitting(false);
    }
  };

  // Open Allocate Modal and Check Conflicts
  const openAllocateModal = async (slip) => {
    setAllocateSlipModal(slip);
    setConflictsLoading(true);
    setConflictsData(null);
    setOverrideConflicting(false);
    setOverrideReason('');
    try {
      const data = await api.permissionSlips.conflicts(slip.id);
      setConflictsData(data);
    } catch (err) {
      alert(err.message || 'Failed to inspect resource conflicts.');
    } finally {
      setConflictsLoading(false);
    }
  };

  // Execute Room Allocation
  const handleAllocateSubmit = async (e) => {
    e.preventDefault();
    if (!allocateSlipModal) return;

    if (conflictsData?.has_conflicts && !overrideConflicting) {
      alert('Room has active booking conflicts. Check "Override Conflicting Bookings" to displace them.');
      return;
    }

    if (overrideConflicting && !overrideReason.trim()) {
      alert('An administrative override justification reason is mandatory.');
      return;
    }

    setActionSubmitting(true);
    setFeedback(null);
    try {
      const resp = await api.permissionSlips.allocate(allocateSlipModal.id, {
        override: overrideConflicting,
        override_reason: overrideReason.trim(),
      });
      setFeedback({
        type: 'success',
        message: `Room ${allocateSlipModal.resource_name} officially allocated! Booking #${resp.booking_id} created.`
      });
      setAllocateSlipModal(null);
      fetchSlips();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Room allocation failed.' });
    } finally {
      setActionSubmitting(false);
    }
  };

  if (authLoading) return <LoadingState />;

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-white">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-8">
            <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-xl text-center">
              <h2 className="text-xl font-bold text-red-400 mb-2">Access Denied</h2>
              <p className="text-sm text-white/70">
                Official permission slip verification is restricted to Department Heads, Facility Managers, and Administrators.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  University Permission Verification & Allocation
                </h1>
                <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-medium">
                  Administrative Workflow
                </span>
              </div>
              <p className="text-sm text-white/60 mt-1">
                Audit submitted paper permission slips, verify official credentials, and execute conflict-safe room allocations.
              </p>
            </div>

            <Link
              href="/permission-slips"
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition"
            >
              ← Back to Slips
            </Link>
          </div>

          {/* Feedback Alert */}
          {feedback && (
            <div
              className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
                feedback.type === 'success'
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/30 border-red-500/40 text-red-200'
              }`}
            >
              <span>{feedback.message}</span>
              <button onClick={() => setFeedback(null)} className="text-xs underline ml-4 hover:opacity-80">
                Dismiss
              </button>
            </div>
          )}

          {/* Filters Bar */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-1 bg-[#141414] p-1 rounded-xl border border-white/10 overflow-x-auto w-full md:w-auto">
              {[
                { id: 'all', label: 'All Slips' },
                { id: 'submitted', label: 'Submitted (New)' },
                { id: 'under_review', label: 'Under Review' },
                { id: 'verified', label: 'Verified & Ready' },
                { id: 'allocated', label: 'Allocated' },
                { id: 'rejected', label: 'Rejected' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <input
                type="text"
                placeholder="Search ref #, requester, purpose..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#141414] border border-white/10 text-white text-xs rounded-xl pl-3 pr-8 py-2.5 focus:outline-none focus:border-purple-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-white/40 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Slips Verification Table */}
          {loading ? (
            <div className="p-12 text-center text-white/50 text-xs">Loading verification requests...</div>
          ) : error ? (
            <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          ) : slips.length === 0 ? (
            <EmptyState
              title="No Pending Slips"
              description="No permission slips match your selected filter criteria."
            />
          ) : (
            <div className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="bg-white/5 text-white/60 uppercase font-semibold text-[11px] border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3.5">Ref # & Document</th>
                      <th className="px-4 py-3.5">Requester & Dept</th>
                      <th className="px-4 py-3.5">Target Facility</th>
                      <th className="px-4 py-3.5">Time Window</th>
                      <th className="px-4 py-3.5">Signing Official</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5 text-right">Verification Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-normal">
                    {slips.map((slip) => {
                      const isSubmitted = slip.verification_status === 'submitted';
                      const isUnderReview = slip.verification_status === 'under_review';
                      const isVerified = slip.verification_status === 'verified';
                      const isAllocated = slip.verification_status === 'allocated';

                      return (
                        <tr key={slip.id} className="hover:bg-white/[0.02] transition">
                          <td className="px-4 py-3.5 font-mono font-semibold text-white">
                            <div>{slip.reference_number}</div>
                            {slip.document_url && (
                              <a
                                href={slip.document_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block mt-1 text-[11px] text-[#F58220] hover:underline"
                              >
                                📄 View Uploaded Slip
                              </a>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-white">{slip.requester_name}</div>
                            <div className="text-[11px] text-white/50">{slip.department}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-white">{slip.resource_name}</div>
                            <div className="text-[11px] text-white/50">{slip.resource_location}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-white">
                              {new Date(slip.start_datetime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <div className="text-[11px] text-white/50">
                              {new Date(slip.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(slip.end_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-white font-medium">{slip.issuing_authority_name}</div>
                            <div className="text-[11px] text-white/50">{slip.issuing_authority_designation}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full border font-semibold bg-white/5 border-white/10 text-white">
                              {slip.status_display}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right space-x-2">
                            {isSubmitted && (
                              <button
                                onClick={() => handleMarkUnderReview(slip)}
                                disabled={actionSubmitting}
                                className="bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition"
                              >
                                Review
                              </button>
                            )}

                            {(isSubmitted || isUnderReview) && (
                              <>
                                <button
                                  onClick={() => {
                                    setVerifySlipModal(slip);
                                    setVerifyNotes('');
                                  }}
                                  disabled={actionSubmitting}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition"
                                >
                                  Verify & Approve
                                </button>
                                <button
                                  onClick={() => {
                                    setRejectSlipModal(slip);
                                    setRejectReason('');
                                  }}
                                  disabled={actionSubmitting}
                                  className="bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {isVerified && (
                              <button
                                onClick={() => openAllocateModal(slip)}
                                disabled={actionSubmitting}
                                className="bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg transition shadow"
                              >
                                Allocate Room
                              </button>
                            )}

                            {isAllocated && (
                              <span className="text-emerald-400 font-mono text-[11px] font-semibold">
                                ✓ Room Allocated (#{slip.linked_booking})
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Verification Modal */}
          {verifySlipModal && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                <h3 className="text-base font-bold text-white">
                  Verify Permission Slip [{verifySlipModal.reference_number}]
                </h3>
                <p className="text-xs text-white/60">
                  By verifying this slip, you certify that the signing authority credentials and physical seal have been authenticated.
                </p>

                <form onSubmit={handleVerifySubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1">
                      Verification Notes (Optional)
                    </label>
                    <textarea
                      rows={3}
                      placeholder="e.g. Verified with Registrar office registry log."
                      value={verifyNotes}
                      onChange={(e) => setVerifyNotes(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setVerifySlipModal(null)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionSubmitting}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl"
                    >
                      {actionSubmitting ? 'Verifying...' : 'Certify & Verify'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Rejection Modal */}
          {rejectSlipModal && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                <h3 className="text-base font-bold text-rose-400">
                  Reject Permission Slip [{rejectSlipModal.reference_number}]
                </h3>
                <p className="text-xs text-white/60">
                  Please provide a clear administrative reason for rejecting this official request.
                </p>

                <form onSubmit={handleRejectSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1">
                      Mandatory Rejection Reason *
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="e.g. Signature does not match registrar records or unapproved event type."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setRejectSlipModal(null)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-xl"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionSubmitting}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl"
                    >
                      {actionSubmitting ? 'Rejecting...' : 'Reject Request'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Room Allocation & Conflict Override Modal */}
          {allocateSlipModal && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-purple-400 tracking-wider font-semibold">
                      Official University Room Allocation
                    </span>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      Allocate {allocateSlipModal.resource_name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setAllocateSlipModal(null)}
                    className="text-white/50 hover:text-white text-lg font-mono"
                  >
                    ✕
                  </button>
                </div>

                <div className="text-xs bg-white/5 p-3 rounded-xl border border-white/10 space-y-1">
                  <div><span className="text-white/50">Slip Ref:</span> <span className="font-semibold text-white">{allocateSlipModal.reference_number}</span></div>
                  <div><span className="text-white/50">Teacher:</span> <span className="text-white">{allocateSlipModal.requester_name}</span></div>
                  <div><span className="text-white/50">Time Window:</span> <span className="text-white font-mono">{new Date(allocateSlipModal.start_datetime).toLocaleString()} – {new Date(allocateSlipModal.end_datetime).toLocaleTimeString()}</span></div>
                </div>

                {conflictsLoading ? (
                  <div className="p-8 text-center text-xs text-white/50">Checking PostgreSQL schedule conflicts...</div>
                ) : conflictsData?.has_conflicts ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-amber-950/30 border border-amber-500/40 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                        <span>⚠️ Existing Bookings Conflict Detected ({conflictsData.total_conflicts})</span>
                      </div>
                      <p className="text-[11px] text-amber-200/80">
                        The requested time slot overlaps with website bookings. An administrative override is required to displace them.
                      </p>
                    </div>

                    {/* Conflict List */}
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {conflictsData.website_conflicts?.map((cb) => (
                        <div key={cb.booking_id} className="text-xs bg-[#1A1A1A] p-3 rounded-xl border border-white/10 flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-white">Booking #{cb.booking_id}: {cb.title}</div>
                            <div className="text-[11px] text-white/50">By: {cb.requester.name} ({cb.requester.role})</div>
                            <div className="text-[11px] text-white/40 font-mono mt-0.5">
                              {new Date(cb.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(cb.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                            Website Booking
                          </span>
                        </div>
                      ))}
                    </div>

                    {canOverrideRole ? (
                      <div className="space-y-3 pt-2 border-t border-white/10">
                        <label className="flex items-center gap-2 text-xs font-semibold text-purple-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={overrideConflicting}
                            onChange={(e) => setOverrideConflicting(e.target.checked)}
                            className="rounded border-white/20 text-purple-600 focus:ring-purple-500"
                          />
                          <span>Authorize Conflict Override & Displace Website Bookings</span>
                        </label>

                        {overrideConflicting && (
                          <div>
                            <label className="block text-xs font-semibold text-white/80 mb-1">
                              Mandatory Displacement Justification *
                            </label>
                            <textarea
                              required
                              rows={2}
                              placeholder="e.g. Sanctioned by Registrar for University Academic Accreditation Inspection."
                              value={overrideReason}
                              onChange={(e) => setOverrideReason(e.target.value)}
                              className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                            />
                            <p className="text-[10px] text-white/40 mt-1">
                              Displaced users will be automatically notified, their consumables restored, and slots safely freed on PostgreSQL.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-3 bg-red-950/20 border border-red-500/30 rounded-xl text-xs text-red-300">
                        Only Facility Managers and Administrators have authority to override conflicting bookings.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
                    ✓ Slot is free on PostgreSQL! No active schedule conflicts detected for this time window.
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setAllocateSlipModal(null)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAllocateSubmit}
                    disabled={actionSubmitting || (conflictsData?.has_conflicts && !overrideConflicting) || (conflictsData?.has_conflicts && !canOverrideRole)}
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow"
                  >
                    {actionSubmitting ? 'Allocating...' : 'Confirm Room Allocation'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
