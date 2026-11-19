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

  // Filter & Search states
  const [activeTab, setActiveTab] = useState('eligible'); // 'eligible', 'pending', 'checked_in', 'completed', 'all'
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split('T')[0]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // Authorization check
  const isAuthorized = user && (
    ['custodian', 'facility_mgr', 'admin', 'dept_head'].includes(user.role) || user.is_superuser
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const fetchBookings = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (dateFilter) params.date = dateFilter;
      if (activeTab === 'pending') {
        params.status = 'approved';
      } else if (activeTab === 'checked_in') {
        params.status = 'checked_in';
      } else if (activeTab === 'completed') {
        params.status = 'completed';
      } else if (activeTab === 'eligible') {
        params.status = 'eligible';
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const data = await api.bookings.checkInDashboard(params);
      setBookings(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch check-in dashboard bookings.');
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, activeTab, dateFilter, searchQuery]);

  useEffect(() => {
    if (isAuthorized) {
      fetchBookings();
    }
  }, [isAuthorized, fetchBookings]);

  // Handle Manual Check-In
  const handleCheckIn = async (booking, force = true) => {
    setActionLoadingId(booking.id);
    setFeedback(null);
    try {
      const resp = await api.bookings.checkIn(booking.id, { force });
      setFeedback({
        type: 'success',
        message: resp.message || `Check-in recorded for Booking #${booking.id} (${booking.resource_name}).`
      });
      // Refresh list to update state
      await fetchBookings();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to check in booking.'
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Manual Check-Out
  const handleCheckOut = async (booking) => {
    setActionLoadingId(booking.id);
    setFeedback(null);
    try {
      const resp = await api.bookings.checkOut(booking.id);
      setFeedback({
        type: 'success',
        message: resp.message || `Check-out recorded for Booking #${booking.id} (${booking.resource_name}). Room marked completed.`
      });
      await fetchBookings();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to check out booking.'
      });
    } finally {
      setActionLoadingId(null);
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
                Check-in and Check-out Desk operations require Custodian, Department Head, Facility Manager, or Administrator privileges.
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // Dashboard Summary Metrics
  const totalCount = bookings.length;
  const pendingCheckInCount = bookings.filter(b => ['approved', 'confirmed'].includes(b.status)).length;
  const currentlyOccupiedCount = bookings.filter(b => b.status === 'checked_in').length;
  const completedCount = bookings.filter(b => b.status === 'completed').length;

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
                  University Check-in & Check-out Desk
                </h1>
                <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-medium">
                  Live Attendance
                </span>
              </div>
              <p className="text-sm text-white/60 mt-1">
                Verify campus room occupancy, record attendee check-in arrival, and process timely check-outs.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-white/70 font-medium">Filter Date:</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-[#1A1A1A] border border-white/10 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-[#F58220]"
              />
              <button
                onClick={fetchBookings}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-medium px-3.5 py-2 rounded-lg transition"
              >
                Refresh
              </button>
            </div>
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
              <button
                onClick={() => setFeedback(null)}
                className="text-xs underline ml-4 hover:opacity-80"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#141414] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-white/50 uppercase font-semibold">Total Filtered</div>
              <div className="text-2xl font-bold text-white mt-1">{totalCount}</div>
            </div>
            <div className="bg-[#141414] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-amber-400 uppercase font-semibold">Awaiting Check-in</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{pendingCheckInCount}</div>
            </div>
            <div className="bg-[#141414] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-emerald-400 uppercase font-semibold">Currently Occupied</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{currentlyOccupiedCount}</div>
            </div>
            <div className="bg-[#141414] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-blue-400 uppercase font-semibold">Checked Out / Completed</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">{completedCount}</div>
            </div>
          </div>

          {/* Controls: Search and Tabs */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Status Tabs */}
            <div className="flex items-center gap-1 bg-[#141414] p-1 rounded-xl border border-white/10 w-full md:w-auto overflow-x-auto">
              {[
                { id: 'eligible', label: 'All Eligible' },
                { id: 'pending', label: 'Pending Check-In' },
                { id: 'checked_in', label: 'Currently Occupied' },
                { id: 'completed', label: 'Completed' },
                { id: 'all', label: 'All Statuses' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'bg-[#F58220] text-white shadow'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <input
                type="text"
                placeholder="Search user, room, booking ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#141414] border border-white/10 text-white text-xs rounded-xl pl-3 pr-8 py-2.5 focus:outline-none focus:border-[#F58220]"
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

          {/* Bookings Table */}
          {loading ? (
            <div className="p-12 text-center text-white/50">Loading desk bookings...</div>
          ) : error ? (
            <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
              {error}
            </div>
          ) : bookings.length === 0 ? (
            <EmptyState
              title="No Bookings Found"
              description="No bookings match your current filter parameters or date selection."
            />
          ) : (
            <div className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-white/80">
                  <thead className="bg-white/5 text-white/60 uppercase font-semibold text-[11px] border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3.5">Booking</th>
                      <th className="px-4 py-3.5">User / Teacher</th>
                      <th className="px-4 py-3.5">Resource / Room</th>
                      <th className="px-4 py-3.5">Schedule Time</th>
                      <th className="px-4 py-3.5">Status</th>
                      <th className="px-4 py-3.5">Attendance Timeline</th>
                      <th className="px-4 py-3.5 text-right">Desk Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-normal">
                    {bookings.map((b) => {
                      const isCheckedIn = b.status === 'checked_in';
                      const isEligibleCheckIn = ['approved', 'confirmed'].includes(b.status);
                      const isOfficial = b.source === 'official_permission';

                      const formatTime = (iso) => {
                        if (!iso) return '-';
                        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      };

                      const formatDate = (iso) => {
                        if (!iso) return '-';
                        return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                      };

                      return (
                        <tr key={b.id} className="hover:bg-white/[0.02] transition">
                          <td className="px-4 py-3.5 font-mono text-white">
                            <div className="flex items-center gap-1.5">
                              <span>#{b.id}</span>
                            </div>
                            {isOfficial && (
                              <div className="mt-1">
                                <span className="inline-block bg-purple-900/50 text-purple-300 border border-purple-500/40 text-[9px] px-1.5 py-0.5 rounded font-semibold tracking-wider">
                                  OFFICIAL ALLOCATION
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-white">{b.requester_name || b.requester?.username}</div>
                            <div className="text-[11px] text-white/50 capitalize">{b.requester_role || b.requester?.role}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-white">{b.resource_name}</div>
                            <div className="text-[11px] text-white/50">{b.resource_location || 'Campus Facility'}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="text-white">{formatDate(b.start_time)}</div>
                            <div className="text-[11px] text-white/60">
                              {formatTime(b.start_time)} – {formatTime(b.end_time)}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={b.status} />
                          </td>
                          <td className="px-4 py-3.5 text-[11px] text-white/60">
                            {b.checked_in_at && (
                              <div className="text-emerald-400">
                                In: {new Date(b.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {b.checked_in_by_name && <span className="text-white/40"> ({b.checked_in_by_name})</span>}
                              </div>
                            )}
                            {b.checked_out_at && (
                              <div className="text-blue-400 mt-0.5">
                                Out: {new Date(b.checked_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {b.checked_out_by_name && <span className="text-white/40"> ({b.checked_out_by_name})</span>}
                              </div>
                            )}
                            {!b.checked_in_at && !b.checked_out_at && (
                              <span className="text-white/30 italic">Not checked in</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            {isEligibleCheckIn && (
                              <button
                                onClick={() => handleCheckIn(b)}
                                disabled={actionLoadingId === b.id}
                                className="bg-[#F58220] hover:bg-[#D96A0B] disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition shadow"
                              >
                                {actionLoadingId === b.id ? 'Checking In...' : 'Check In'}
                              </button>
                            )}

                            {isCheckedIn && (
                              <button
                                onClick={() => handleCheckOut(b)}
                                disabled={actionLoadingId === b.id}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-3 py-1.5 rounded-lg text-xs transition shadow"
                              >
                                {actionLoadingId === b.id ? 'Checking Out...' : 'Check Out'}
                              </button>
                            )}

                            {!isEligibleCheckIn && !isCheckedIn && (
                              <span className="text-white/30 text-[11px] italic">No action</span>
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
        </main>
      </div>
    </div>
  );
}
