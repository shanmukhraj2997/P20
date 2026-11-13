'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import StatusBadge from '@/components/StatusBadge';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { api } from '@/lib/api';

export default function ApprovalsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('pending'); // 'pending' or 'all'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  // Review Action States
  const [processingId, setProcessingId] = useState(null);
  const [rejectingBooking, setRejectingBooking] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectError, setRejectError] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const isStaffRole = user && (
    ['custodian', 'dept_head', 'facility_mgr', 'admin'].includes(user.role) ||
    user.is_superuser
  );

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = filter === 'pending' ? { status: 'pending' } : {};
      const data = await api.bookings.manage(params);
      setBookings(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load booking approvals queue.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (user && isStaffRole) {
      fetchBookings();
    }
  }, [user, isStaffRole, fetchBookings]);

  const handleApprove = async (bookingId) => {
    setProcessingId(bookingId);
    setActionMsg(null);
    setError(null);
    try {
      await api.bookings.approve(bookingId, 'Approved by staff review.');
      setActionMsg('Booking has been approved successfully.');
      fetchBookings();
    } catch (err) {
      setError(err.message || 'Failed to approve booking.');
    } finally {
      setProcessingId(null);
    }
  };

  const openRejectModal = (booking) => {
    setRejectingBooking(booking);
    setRejectNote('');
    setRejectError(null);
  };

  const handleConfirmReject = async () => {
    if (!rejectNote.trim()) {
      setRejectError('A decision note explaining the rejection reason is required.');
      return;
    }

    setProcessingId(rejectingBooking.id);
    setActionMsg(null);
    setError(null);
    try {
      await api.bookings.reject(rejectingBooking.id, rejectNote.trim());
      setActionMsg('Booking has been rejected and the time slot released.');
      setRejectingBooking(null);
      fetchBookings();
    } catch (err) {
      setRejectError(err.message || 'Failed to reject booking.');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDateTime = (isoString) => {
    if (!isoString) return 'N/A';
    const d = new Date(isoString);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (authLoading || (!user && !error)) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center">
        <LoadingState message="Authenticating review credentials..." />
      </div>
    );
  }

  if (!isStaffRole) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
        <Header />
        <div className="flex flex-1">
          <Sidebar />
          <main className="flex-1 p-8 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl border border-[#E5E5E5] shadow-2xs max-w-md text-center">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-4 border border-amber-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-[#111111] mb-2">Restricted Access</h2>
              <p className="text-xs text-[#6B6B6B] mb-6">
                Booking approvals and reservation review workflows require Custodian, Department Head, Facility Manager, or Administrator privileges.
              </p>
              <button
                onClick={() => router.push('/dashboard')}
                className="px-4 py-2 bg-[#F58220] hover:bg-[#D96A0B] text-white text-xs font-bold rounded-lg shadow-md transition-all cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const pendingCount = bookings.filter((b) => b.status === 'pending').length;

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {/* Header Title & Subtitle */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#111111]">
                  Booking Approvals
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FFF3E6] text-[#D96A0B] border border-[#F58220]/30">
                  {filter === 'pending' ? `${pendingCount} Pending` : `${bookings.length} Total`}
                </span>
              </div>
              <p className="text-xs text-[#6B6B6B] mt-1">
                Review, authorize, or reject reservation requests for campus laboratories and facilities.
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-[#E5E5E5] self-start sm:self-auto shadow-2xs">
              <button
                onClick={() => setFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  filter === 'pending'
                    ? 'bg-[#F58220] text-white shadow-xs font-semibold'
                    : 'text-[#6B6B6B] hover:text-[#111111]'
                }`}
              >
                Pending Queue
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  filter === 'all'
                    ? 'bg-[#F58220] text-white shadow-xs font-semibold'
                    : 'text-[#6B6B6B] hover:text-[#111111]'
                }`}
              >
                All Scope Bookings
              </button>
            </div>
          </div>

          {/* Success / Action Notification */}
          {actionMsg && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-300 flex items-center justify-between text-emerald-800 text-xs shadow-2xs">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span className="font-semibold">{actionMsg}</span>
              </div>
              <button onClick={() => setActionMsg(null)} className="text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer">
                &times;
              </button>
            </div>
          )}

          {/* Error Notification */}
          {error && <ErrorState message={error} retry={fetchBookings} />}

          {/* Loading State */}
          {loading && <LoadingState count={3} />}

          {/* Empty State */}
          {!loading && !error && bookings.length === 0 && (
            <EmptyState
              message={
                filter === 'pending'
                  ? 'All requested reservations within your jurisdiction have been reviewed and processed.'
                  : 'There are currently no bookings recorded for your managed resources or department.'
              }
            />
          )}

          {/* Bookings Queue Cards */}
          {!loading && !error && bookings.length > 0 && (
            <div className="space-y-4">
              {bookings.map((booking) => {
                const isPending = booking.status === 'pending';
                return (
                  <div
                    key={booking.id}
                    className={`bg-white rounded-2xl p-5 border shadow-2xs transition-all ${
                      isPending
                        ? 'border-[#E5E5E5] hover:border-[#F58220]'
                        : 'border-[#E5E5E5]'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Booking Details Left Column */}
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-[#111111]">
                            {booking.resource_name}
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5F5F5] text-[#111111] border border-[#E5E5E5]">
                            {booking.resource_type_name || 'Resource'}
                          </span>
                          <StatusBadge status={booking.status} />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-1 gap-x-4 text-xs text-[#6B6B6B]">
                          <div>
                            <span className="text-[#6B6B6B] font-medium">Requester: </span>
                            <span className="text-[#111111] font-semibold">{booking.requester_name}</span>
                            <span className="text-[#6B6B6B] text-[10px] ml-1">({booking.requester_role})</span>
                          </div>
                          <div>
                            <span className="text-[#6B6B6B] font-medium">Location: </span>
                            <span className="text-[#111111]">{booking.resource_location}</span>
                          </div>
                          <div>
                            <span className="text-[#6B6B6B] font-medium">Submitted: </span>
                            <span className="text-[#111111]">{formatDateTime(booking.created_at)}</span>
                          </div>
                        </div>

                        <div className="text-xs text-[#111111] pt-1">
                          <span className="text-[#6B6B6B] font-medium">Reserved Time: </span>
                          <span className="font-mono text-[#F58220] font-semibold">
                            {formatDateTime(booking.start_time)} &rarr; {formatDateTime(booking.end_time)}
                          </span>
                        </div>

                        <div className="text-xs text-[#111111] bg-[#F5F5F5] p-2.5 rounded-lg border border-[#E5E5E5]">
                          <span className="text-[#6B6B6B] font-semibold">Purpose: </span>
                          <span>{booking.purpose}</span>
                        </div>

                        {/* Reviewer Note / Decision Audit Trail if exists */}
                        {booking.decision_note && (
                          <div className="text-xs text-[#111111] bg-[#FFF3E6] p-2.5 rounded-lg border border-[#F58220]/30">
                            <span className="text-[#D96A0B] font-semibold">Review Decision Note: </span>
                            <span>{booking.decision_note}</span>
                            {booking.reviewed_by_name && (
                              <span className="text-[#6B6B6B] text-[10px] ml-2">
                                (by {booking.reviewed_by_name} at {formatDateTime(booking.reviewed_at)})
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons Right Column */}
                      {isPending ? (
                        <div className="flex sm:flex-col lg:flex-row items-center gap-2 shrink-0 pt-2 lg:pt-0">
                          <button
                            onClick={() => handleApprove(booking.id)}
                            disabled={processingId === booking.id}
                            className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            <span>{processingId === booking.id ? 'Approving...' : 'Approve'}</span>
                          </button>

                          <button
                            onClick={() => openRejectModal(booking)}
                            disabled={processingId === booking.id}
                            className="flex-1 sm:flex-none px-4 py-2 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-300 hover:border-transparent text-xs font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center space-x-1.5 cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <div className="shrink-0 text-right">
                          <span className="text-[11px] text-[#6B6B6B]">
                            Status finalized: <strong className="text-[#111111] capitalize">{booking.status}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Modal for Rejecting Booking with Mandatory Note */}
          {rejectingBooking && (
            <div className="fixed inset-0 z-50 bg-[#111111]/70 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-2xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#111111]">Reject Booking Request</h3>
                    <p className="text-xs text-[#6B6B6B]">
                      Rejection will release the time slot for other users.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-[#F5F5F5] rounded-xl border border-[#E5E5E5] text-xs space-y-1">
                  <div>
                    <span className="text-[#6B6B6B] font-medium">Resource: </span>
                    <span className="text-[#111111] font-semibold">{rejectingBooking.resource_name}</span>
                  </div>
                  <div>
                    <span className="text-[#6B6B6B] font-medium">Requester: </span>
                    <span className="text-[#111111]">{rejectingBooking.requester_name}</span>
                  </div>
                </div>

                {rejectError && (
                  <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold">
                    {rejectError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">
                    Decision Note / Rejection Reason <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Provide a clear academic or administrative justification for rejecting this request..."
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] placeholder-[#6B6B6B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220]"
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRejectingBooking(null)}
                    disabled={processingId !== null}
                    className="px-3.5 py-2 text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] border border-[#111111] rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmReject}
                    disabled={processingId !== null}
                    className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {processingId === rejectingBooking.id ? 'Rejecting...' : 'Confirm Rejection'}
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
