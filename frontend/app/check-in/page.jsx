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

export default function CheckInDeskPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Mode: 'token' (QR Scan/Token input) or 'lookup' (Manual booking search)
  const [activeTab, setActiveTab] = useState('token');

  // Token scan state
  const [tokenInput, setTokenInput] = useState('');
  const [resourceIdInput, setResourceIdInput] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState(null);
  const [tokenSuccess, setTokenSuccess] = useState(null);

  // Manual lookup state
  const [bookings, setBookings] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingBookings, setLoadingBookings] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [lookupSuccess, setLookupSuccess] = useState(null);

  // Authorization check
  const isAuthorized = user && (
    ['custodian', 'facility_mgr', 'admin', 'dept_head'].includes(user.role) || user.is_superuser
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const fetchManageBookings = useCallback(async () => {
    if (!isAuthorized) return;
    setLoadingBookings(true);
    setLookupError(null);
    try {
      const data = await api.bookings.manage({ status: 'approved' });
      setBookings(data);
    } catch (err) {
      setLookupError(err.message || 'Failed to fetch bookings for desk verification.');
    } finally {
      setLoadingBookings(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (isAuthorized && activeTab === 'lookup') {
      fetchManageBookings();
    }
  }, [isAuthorized, activeTab, fetchManageBookings]);

  // Handle Token / QR Submission
  const handleTokenSubmit = async (e) => {
    e.preventDefault();
    let rawToken = tokenInput.trim();
    if (!rawToken) {
      setTokenError('Please enter or scan a check-in token.');
      return;
    }

    let finalToken = rawToken;
    let finalResId = resourceIdInput.trim();

    // Support scanned JSON payloads from QR codes
    if (rawToken.startsWith('{') && rawToken.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawToken);
        if (parsed.token) finalToken = String(parsed.token);
        if (parsed.resource_id && !finalResId) finalResId = String(parsed.resource_id);
      } catch {
        // Keep raw string
      }
    }

    setTokenLoading(true);
    setTokenError(null);
    setTokenSuccess(null);

    try {
      const payload = { token: finalToken };
      if (finalResId) {
        payload.resource_id = parseInt(finalResId, 10);
      }
      const resp = await api.bookings.checkInWithToken(payload);
      setTokenSuccess({
        message: resp.message || 'Check-in verified successfully!',
        booking: resp.booking,
      });
      setTokenInput('');
      setResourceIdInput('');
    } catch (err) {
      setTokenError(err.message || 'Check-in validation failed.');
    } finally {
      setTokenLoading(false);
    }
  };

  // Handle Manual Direct Check-in
  const handleManualCheckIn = async (booking) => {
    setActionLoadingId(booking.id);
    setLookupError(null);
    setLookupSuccess(null);

    try {
      await api.bookings.checkIn(booking.id, {
        resource_id: booking.resource,
        force: false,
      });
      setLookupSuccess(`Booking #${booking.id} (${booking.resource_name}) checked in successfully!`);
      // Update local list
      setBookings((prev) =>
        prev.map((b) => (b.id === booking.id ? { ...b, status: 'checked_in', status_display: 'Checked In' } : b))
      );
      setTimeout(() => setLookupSuccess(null), 4000);
    } catch (err) {
      setLookupError(err.message || `Check-in failed for booking #${booking.id}.`);
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatSlotTime = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return isoString;
    }
  };

  const formatSlotDate = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const filteredLookupBookings = bookings.filter((b) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(b.id).includes(q) ||
      (b.resource_name && b.resource_name.toLowerCase().includes(q)) ||
      (b.requester_name && b.requester_name.toLowerCase().includes(q)) ||
      (b.requester && String(b.requester).toLowerCase().includes(q))
    );
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-[#6B6B6B] text-sm">
        Authenticating session...
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
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
                The Custodian Check-in Desk is reserved for custodians, facility managers, and campus administrators.
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
          <div className="bg-[#111111] border border-[#222222] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
            <div className="relative z-10 max-w-2xl">
              <div className="inline-flex items-center space-x-2 bg-[#F58220]/20 text-[#F58220] px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider mb-3 border border-[#F58220]/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Module M6 • Live Check-In</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-2">
                Custodian Check-in Desk
              </h1>
              <p className="text-white/70 text-xs md:text-sm leading-relaxed">
                Verify student and faculty access passes via QR code scanning, cryptographic check-in token, or direct booking roster lookup.
              </p>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="flex items-center space-x-2 border-b border-[#E5E5E5] pb-3">
            <button
              onClick={() => setActiveTab('token')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                activeTab === 'token'
                  ? 'bg-[#F58220] text-white shadow-md'
                  : 'bg-white text-[#111111] border border-[#E5E5E5] hover:bg-[#F5F5F5]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <span>Token / QR Scanner</span>
            </button>

            <button
              onClick={() => setActiveTab('lookup')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 cursor-pointer ${
                activeTab === 'lookup'
                  ? 'bg-[#F58220] text-white shadow-md'
                  : 'bg-white text-[#111111] border border-[#E5E5E5] hover:bg-[#F5F5F5]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>Manual Booking Lookup</span>
            </button>
          </div>

          {/* TAB 1: Token / QR Scan Input */}
          {activeTab === 'token' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Scan Form Card */}
              <div className="lg:col-span-2 bg-white rounded-3xl border border-[#E5E5E5] p-6 md:p-8 shadow-xs space-y-6">
                <div>
                  <h2 className="text-base font-bold text-[#111111]">QR Code / Token Verification</h2>
                  <p className="text-xs text-[#6B6B6B] mt-1">
                    Scan the attendee's QR pass using a USB barcode/QR scanner, or manually paste the UUID check-in token below.
                  </p>
                </div>

                {tokenError && (
                  <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-800 text-xs flex items-start space-x-3">
                    <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <span className="font-bold">Check-in Rejected: </span>
                      {tokenError}
                    </div>
                  </div>
                )}

                {tokenSuccess && (
                  <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs flex items-start space-x-3">
                    <svg className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    <div>
                      <span className="font-bold">Success: </span>
                      {tokenSuccess.message}
                    </div>
                  </div>
                )}

                <form onSubmit={handleTokenSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Check-in Token or Scanned QR String <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder="Paste UUID token or focus here for USB scanner (e.g. 550e8400-e29b-41d4-a716-446655440000)"
                      className="w-full px-4 py-3 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs font-mono text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:border-transparent transition-all"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">
                      Target Resource ID (Optional Room Match Verification)
                    </label>
                    <input
                      type="number"
                      value={resourceIdInput}
                      onChange={(e) => setResourceIdInput(e.target.value)}
                      placeholder="Leave empty to accept resource assigned to token"
                      className="w-full px-4 py-2.5 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:border-transparent transition-all"
                    />
                  </div>

                  <div className="pt-2 flex items-center space-x-3">
                    <button
                      type="submit"
                      disabled={tokenLoading || !tokenInput.trim()}
                      className="px-6 py-3 bg-[#F58220] hover:bg-[#D96A0B] disabled:bg-[#E5E5E5] disabled:text-[#6B6B6B] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center space-x-2 focus:ring-2 focus:ring-[#F58220] cursor-pointer"
                    >
                      {tokenLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Validating Check-In...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>Execute Check-In</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTokenInput('');
                        setResourceIdInput('');
                        setTokenError(null);
                        setTokenSuccess(null);
                      }}
                      className="px-4 py-3 bg-white hover:bg-[#F5F5F5] border border-[#111111] text-[#111111] text-xs font-semibold rounded-xl transition-all cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </form>
              </div>

              {/* Status / Quick Info Card */}
              <div className="bg-white rounded-3xl border border-[#E5E5E5] p-6 shadow-xs flex flex-col justify-between space-y-6">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] mb-3">Verification Rules</h3>
                  <ul className="space-y-3 text-xs text-[#111111]">
                    <li className="flex items-start space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F58220] mt-1.5 shrink-0"></span>
                      <span>Window opens <strong>15 minutes</strong> before slot start.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F58220] mt-1.5 shrink-0"></span>
                      <span>Grace period closes <strong>30 minutes</strong> after start time.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F58220] mt-1.5 shrink-0"></span>
                      <span>Unclaimed bookings are automatically released by Celery background worker.</span>
                    </li>
                    <li className="flex items-start space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F58220] mt-1.5 shrink-0"></span>
                      <span>Duplicate check-ins are strictly rejected by the server.</span>
                    </li>
                  </ul>
                </div>

                {tokenSuccess?.booking && (
                  <div className="p-4 bg-[#F5F5F5] border border-[#E5E5E5] rounded-2xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#111111]">Pass Details</span>
                      <StatusBadge status={tokenSuccess.booking.status} display={tokenSuccess.booking.status_display} />
                    </div>
                    <div className="text-xs text-[#111111]">
                      <div><strong>Booking:</strong> #{tokenSuccess.booking.id}</div>
                      <div><strong>Resource:</strong> {tokenSuccess.booking.resource_name}</div>
                      <div><strong>Attendee:</strong> {tokenSuccess.booking.requester_name}</div>
                      <div><strong>Checked-in at:</strong> {formatSlotTime(tokenSuccess.booking.checked_in_at)}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Manual Booking Lookup */}
          {activeTab === 'lookup' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-[#E5E5E5]">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Booking ID, Resource Name, or Attendee username..."
                    className="w-full pl-9 pr-4 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl text-xs text-[#111111] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                  />
                  <svg className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  onClick={fetchManageBookings}
                  className="px-4 py-2 bg-white border border-[#E5E5E5] hover:bg-[#F5F5F5] text-[#111111] text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  Refresh Queue
                </button>
              </div>

              {lookupError && (
                <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-rose-800 text-xs flex items-start space-x-2">
                  <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{lookupError}</span>
                </div>
              )}

              {lookupSuccess && (
                <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs flex items-start space-x-2">
                  <svg className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-semibold">{lookupSuccess}</span>
                </div>
              )}

              {loadingBookings ? (
                <LoadingState count={4} />
              ) : filteredLookupBookings.length === 0 ? (
                <EmptyState
                  message={
                    searchQuery
                      ? `No approved bookings matching '${searchQuery}'.`
                      : 'No approved bookings awaiting check-in in your jurisdiction.'
                  }
                />
              ) : (
                <div className="space-y-3">
                  {filteredLookupBookings.map((b) => {
                    const isCheckingIn = actionLoadingId === b.id;
                    const isCheckedIn = b.status === 'checked_in';

                    return (
                      <div
                        key={b.id}
                        className="bg-white rounded-2xl border border-[#E5E5E5] p-5 shadow-2xs hover:border-[#F58220] transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-bold text-[#F58220] bg-[#FFF3E6] px-2.5 py-0.5 rounded-md border border-[#F58220]/30">
                              Booking #{b.id}
                            </span>
                            <StatusBadge status={b.status} display={b.status_display} />
                          </div>
                          <h3 className="text-sm font-bold text-[#111111]">{b.resource_name}</h3>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#6B6B6B]">
                            <span><strong>Requester:</strong> {b.requester_name} ({b.requester_role})</span>
                            <span>•</span>
                            <span>{formatSlotDate(b.start_time)} {formatSlotTime(b.start_time)} – {formatSlotTime(b.end_time)}</span>
                          </div>
                          <div className="text-[11px] text-[#6B6B6B] font-mono">
                            Token: {b.checkin_token || 'N/A'}
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center space-x-2">
                          {isCheckedIn ? (
                            <span className="px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center space-x-1">
                              <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Checked In</span>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleManualCheckIn(b)}
                              disabled={isCheckingIn}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-[#E5E5E5] disabled:text-[#6B6B6B] text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center space-x-1.5 cursor-pointer"
                            >
                              {isCheckingIn ? (
                                <>
                                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  <span>Verifying...</span>
                                </>
                              ) : (
                                <>
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                  </svg>
                                  <span>Check In</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
