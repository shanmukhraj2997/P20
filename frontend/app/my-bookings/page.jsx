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
import ConfirmModal from '@/components/ConfirmModal';
import QrCheckInModal from '@/components/QrCheckInModal';
import QrScanModal from '@/components/QrScanModal';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function MyBookingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [bookings, setBookings] = useState([]);
  const [manageBookings, setManageBookings] = useState([]);
  const [activeTab, setActiveTab] = useState('my'); // 'my' or 'staff'
  const [statusFilter, setStatusFilter] = useState('all');
  const [timelineFilter, setTimelineFilter] = useState('all'); // 'all', 'upcoming', 'past'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  // QR Modal States
  const [qrModalBooking, setQrModalBooking] = useState(null);
  const [showScanModal, setShowScanModal] = useState(false);

  // Cancellation Modal State
  const [cancellingBooking, setCancellingBooking] = useState(null);
  const [cancellingLoading, setCancellingLoading] = useState(false);
  const [cancelSeries, setCancelSeries] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const isStaffRole = user && (['custodian', 'dept_head', 'facility_mgr', 'admin'].includes(user.role) || user.is_superuser);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.bookings.list();
      setBookings(data);

      if (isStaffRole) {
        const staffData = await api.bookings.manage().catch(() => []);
        setManageBookings(staffData);
      }
    } catch (err) {
      setError(err.message || 'Failed to load bookings.');
    } finally {
      setLoading(false);
    }
  }, [isStaffRole]);

  useEffect(() => {
    if (user) {
      fetchBookings();
    }
  }, [user, fetchBookings]);

  const confirmCancel = async () => {
    if (!cancellingBooking) return;
    setCancellingLoading(true);
    try {
      await api.bookings.cancel(cancellingBooking.id, cancelSeries);
      setActionMsg(
        cancelSeries
          ? `All bookings in recurring series #${cancellingBooking.series} successfully cancelled.`
          : `Booking #${cancellingBooking.id} successfully cancelled. PostgreSQL time slot released.`
      );
      setCancellingBooking(null);
      setCancelSeries(false);
      fetchBookings();
      setTimeout(() => setActionMsg(null), 4000);
    } catch (err) {
      alert(err.message || 'Failed to cancel booking.');
    } finally {
      setCancellingLoading(false);
    }
  };

  const currentList = activeTab === 'staff' ? manageBookings : bookings;

  const filteredBookings = currentList.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) {
      return false;
    }
    if (timelineFilter === 'upcoming') {
      if (!b.end_time) return false;
      return new Date(b.end_time) >= new Date() && b.status !== 'cancelled';
    }
    if (timelineFilter === 'past') {
      if (!b.end_time) return true;
      return new Date(b.end_time) < new Date() || b.status === 'cancelled';
    }
    return true;
  });

  const formatDateRange = (startStr, endStr) => {
    if (!startStr || !endStr) return { date: 'N/A', time: 'N/A' };
    const s = new Date(startStr);
    const e = new Date(endStr);
    const date = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const startTime = s.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const endTime = e.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return { date, time: `${startTime} - ${endTime}` };
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-[#6B6B6B] text-sm">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-6">
          {/* Top Header Banner */}
          <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs text-[#F58220] font-bold uppercase tracking-wider mb-1">
                <span>Module M3</span>
                <span>•</span>
                <span>My Reservations</span>
              </div>
              <h2 className="text-2xl font-bold text-[#111111]">Campus Bookings & Reservations</h2>
              <p className="text-xs text-[#6B6B6B] mt-1">
                View active resource reservations, review schedule status, or cancel booked slots.
              </p>
            </div>

            <Link
              href="/resources"
              className="px-4 py-2.5 bg-[#F58220] hover:bg-[#D96A0B] text-white text-xs font-bold rounded-xl shadow-md transition-all shrink-0 text-center focus:ring-2 focus:ring-[#F58220]"
            >
              + New Resource Booking
            </Link>
          </div>

          {actionMsg && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold shadow-2xs flex items-center space-x-2">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>{actionMsg}</span>
            </div>
          )}

          {/* Navigation Tabs & Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-[#E5E5E5]">
            {/* View Switcher Tabs (My Bookings vs Staff Management) */}
            <div className="flex flex-wrap items-center gap-2 border-b md:border-b-0 border-[#E5E5E5] pb-2 md:pb-0">
              <button
                onClick={() => setActiveTab('my')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'my'
                    ? 'bg-[#F58220] text-white shadow-xs'
                    : 'text-[#111111] hover:bg-[#F5F5F5]'
                }`}
                id="my-bookings-tab"
              >
                My Reservations ({bookings.length})
              </button>

              {/* Export All ICS Button */}
              <a
                href={api.bookings.exportAllIcsUrl()}
                download="campus_bookings.ics"
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#F5F5F5] hover:bg-[#FFF3E6] text-[#111111] hover:text-[#D96A0B] border border-[#E5E5E5] hover:border-[#F58220] rounded-xl text-xs font-bold transition-all shadow-2xs"
                id="export-all-ics-btn"
                title="Download .ics calendar of all bookings"
              >
                <svg className="w-4 h-4 text-[#6B6B6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Export (.ics)</span>
              </a>

              {isStaffRole && (
                <button
                  onClick={() => setActiveTab('staff')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'staff'
                      ? 'bg-[#F58220] text-white shadow-xs'
                      : 'text-[#111111] hover:bg-[#F5F5F5]'
                  }`}
                  id="staff-manage-tab"
                >
                  Staff Management ({manageBookings.length})
                </button>
              )}
            </div>

            {/* Timeline & Status Filters */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {/* Timeline segment */}
              <div className="flex items-center space-x-1 bg-[#F5F5F5] p-1 rounded-xl border border-[#E5E5E5]">
                <button
                  onClick={() => setTimelineFilter('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    timelineFilter === 'all' ? 'bg-white font-bold text-[#111111] shadow-2xs' : 'text-[#6B6B6B] hover:text-[#111111]'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setTimelineFilter('upcoming')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    timelineFilter === 'upcoming' ? 'bg-white font-bold text-[#111111] shadow-2xs' : 'text-[#6B6B6B] hover:text-[#111111]'
                  }`}
                >
                  Upcoming
                </button>
                <button
                  onClick={() => setTimelineFilter('past')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    timelineFilter === 'past' ? 'bg-white font-bold text-[#111111] shadow-2xs' : 'text-[#6B6B6B] hover:text-[#111111]'
                  }`}
                >
                  Past
                </button>
              </div>

              {/* Status Filter */}
              <div className="flex items-center space-x-1.5">
                <span className="text-[#6B6B6B] font-medium text-[11px]">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg text-xs text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#F58220]"
                  id="booking-status-filter"
                >
                  <option value="all">All Statuses</option>
                  <option value="approved">Approved</option>
                  <option value="checked_in">Checked In</option>
                  <option value="pending">Pending</option>
                  <option value="no_show">No Show</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {isStaffRole && (
                <button
                  onClick={() => setShowScanModal(true)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-[#FFF3E6] hover:bg-[#F58220] text-[#D96A0B] hover:text-white border border-[#F58220]/40 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
                  id="staff-scan-button"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  <span>Desk Check-In</span>
                </button>
              )}
            </div>
          </div>

          {/* Bookings Content State */}
          {loading ? (
            <LoadingState count={4} />
          ) : error ? (
            <ErrorState error={error} onRetry={fetchBookings} />
          ) : filteredBookings.length === 0 ? (
            <EmptyState
              message={
                statusFilter !== 'all'
                  ? `No bookings found with status '${statusFilter}'.`
                  : "You currently have no active or past campus resource bookings."
              }
            />
          ) : (
            <div className="space-y-4">
              {filteredBookings.map((b) => {
                const { date, time } = formatDateRange(b.start_time, b.end_time);
                const isCancelled = b.status === 'cancelled';

                return (
                  <div
                    key={b.id}
                    className={`bg-white rounded-2xl border p-6 shadow-2xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isCancelled ? 'border-[#E5E5E5] opacity-75 bg-[#F5F5F5]/50' : 'border-[#E5E5E5] hover:border-[#F58220]'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-[#F58220] bg-[#FFF3E6] px-2.5 py-0.5 rounded-md border border-[#F58220]/30">
                          Booking #{b.id}
                        </span>
                        <StatusBadge status={b.status} display={b.status_display} />
                        {b.series && (
                          <span className="text-[10px] font-bold text-[#111111] bg-[#F5F5F5] px-2 py-0.5 rounded-md border border-[#E5E5E5]">
                            Series #{b.series}
                          </span>
                        )}
                        {b.kind === 'timetable' && (
                          <span className="text-[10px] font-bold text-[#111111] bg-[#F5F5F5] px-2 py-0.5 rounded-md border border-[#E5E5E5]">
                            Timetable Hold
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-[#111111]">{b.resource_name}</h3>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-[#6B6B6B]">
                        <span className="flex items-center space-x-1">
                          <svg className="w-4 h-4 text-[#6B6B6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          </svg>
                          <span>{b.resource_location}</span>
                        </span>

                        <span className="flex items-center space-x-1">
                          <svg className="w-4 h-4 text-[#6B6B6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="font-semibold text-[#111111]">{date}</span>
                        </span>

                        <span className="flex items-center space-x-1">
                          <svg className="w-4 h-4 text-[#6B6B6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-semibold text-[#111111]">{time}</span>
                        </span>
                      </div>

                      <p className="text-xs text-[#6B6B6B] italic">Purpose: "{b.purpose}"</p>
                      {activeTab === 'staff' && (
                        <p className="text-xs text-[#F58220] font-medium">
                          Requester: {b.requester_name} ({b.requester_role})
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      {/* QR Check-In Action Button (Approved Bookings Only) */}
                      {['approved', 'checked_in'].includes(b.status) && (
                        <button
                          onClick={() => setQrModalBooking(b)}
                          className={`px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center space-x-1.5 border shadow-2xs cursor-pointer ${
                            b.status === 'checked_in'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                              : 'bg-[#FFF3E6] text-[#D96A0B] border-[#F58220]/40 hover:bg-[#F58220] hover:text-white'
                          }`}
                          id={`qr-checkin-${b.id}`}
                        >
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                          </svg>
                          <span>{b.status === 'checked_in' ? 'Pass Checked-In' : 'Access QR & Check-In'}</span>
                        </button>
                      )}

                      <Link
                        href={`/resources/${b.resource}/availability`}
                        className="px-3.5 py-2 bg-[#F5F5F5] hover:bg-white text-[#111111] border border-[#E5E5E5] text-xs font-semibold rounded-xl transition-all"
                      >
                        Calendar
                      </Link>

                      {/* Add to Calendar (.ics) export */}
                      <a
                        href={api.bookings.exportBookingIcsUrl(b.id)}
                        download={`booking_${b.id}.ics`}
                        className="px-3 py-2 bg-[#F5F5F5] hover:bg-white text-[#111111] border border-[#E5E5E5] text-xs font-semibold rounded-xl transition-all flex items-center space-x-1"
                        id={`export-ics-${b.id}`}
                        title="Add to Calendar (.ics)"
                      >
                        <svg className="w-3.5 h-3.5 text-[#6B6B6B]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span>Add to Calendar</span>
                      </a>

                      {!isCancelled && b.status !== 'checked_in' && b.status !== 'completed' && b.status !== 'no_show' && b.status !== 'rejected' && (
                        <button
                          onClick={() => setCancellingBooking(b)}
                          className="px-3.5 py-2 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-300 hover:border-transparent text-xs font-bold rounded-xl transition-all cursor-pointer"
                          id={`cancel-booking-${b.id}`}
                        >
                          Cancel Booking
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* QR Check-In Modal */}
          <QrCheckInModal
            isOpen={Boolean(qrModalBooking)}
            booking={qrModalBooking}
            isStaff={isStaffRole}
            onClose={() => setQrModalBooking(null)}
            onCheckedIn={(updated) => {
              setActionMsg(`Booking #${updated.id} checked in successfully!`);
              fetchBookings();
              setTimeout(() => setActionMsg(null), 3500);
            }}
          />

          {/* Staff Kiosk / Scanner Modal */}
          <QrScanModal
            isOpen={showScanModal}
            onClose={() => setShowScanModal(false)}
            onCheckedIn={(updated) => {
              setActionMsg(`Check-in verified for Booking #${updated.id}!`);
              fetchBookings();
              setTimeout(() => setActionMsg(null), 3500);
            }}
          />

          {/* Cancellation Confirmation Modal */}
          <ConfirmModal
            isOpen={Boolean(cancellingBooking)}
            title="Cancel Campus Reservation?"
            message={
              cancellingBooking
                ? `Are you sure you want to cancel Booking #${cancellingBooking.id} for "${cancellingBooking.resource_name}"? The time slot will immediately be released on PostgreSQL for other users.`
                : ''
            }
            confirmText={cancelSeries ? "Cancel Entire Series" : "Yes, Release Slot"}
            cancelText="Keep Booking"
            danger={true}
            loading={cancellingLoading}
            onConfirm={confirmCancel}
            onCancel={() => {
              setCancellingBooking(null);
              setCancelSeries(false);
            }}
          >
            {cancellingBooking?.series && (
              <label className="flex items-center space-x-2.5 text-xs text-[#111111] bg-[#F5F5F5] p-3 rounded-xl border border-[#E5E5E5] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={cancelSeries}
                  onChange={(e) => setCancelSeries(e.target.checked)}
                  className="rounded text-[#F58220] focus:ring-[#F58220] w-4 h-4 cursor-pointer"
                  id="cancel-series-checkbox"
                />
                <div>
                  <span className="font-bold">Cancel entire recurring series</span>
                  <p className="text-[11px] text-[#6B6B6B] font-normal">Also cancel all other scheduled occurrences in Series #{cancellingBooking.series}.</p>
                </div>
              </label>
            )}
          </ConfirmModal>
        </main>
      </div>
    </div>
  );
}
