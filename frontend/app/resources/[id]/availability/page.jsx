'use client';

import React, { useEffect, useState, useRef, use, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import StatusBadge from '@/components/StatusBadge';
import { api } from '@/lib/api';
import Link from 'next/link';

import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

export default function AvailabilityBookingPage({ params }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const calendarRef = useRef(null);

  const [resource, setResource] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form State
  const [bookingDate, setBookingDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [purpose, setPurpose] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Set default booking date to tomorrow
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    setBookingDate(dateStr);
  }, []);

  // Load Resource details
  useEffect(() => {
    if (user && id) {
      api.resources.get(id)
        .then((data) => setResource(data))
        .catch((err) => setError(err.message || 'Failed to load resource details.'));
    }
  }, [user, id]);

  // Load Calendar Availability Events
  const fetchAvailability = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await api.resources.availability(id);
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch resource availability schedule.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (user && id) {
      fetchAvailability();
    }
  }, [user, id, fetchAvailability]);

  // Handle Calendar Select
  const handleCalendarSelect = (selectInfo) => {
    const startDate = selectInfo.startStr.split('T')[0];
    setBookingDate(startDate);

    if (selectInfo.startStr.includes('T')) {
      const sTime = selectInfo.startStr.split('T')[1].substring(0, 5);
      const eTime = selectInfo.endStr.split('T')[1].substring(0, 5);
      setStartTime(sTime);
      setEndTime(eTime);
    }
  };

  // Submit Booking Form
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setBookingError(null);
    setSuccessMessage(null);

    if (!bookingDate || !startTime || !endTime || !purpose.trim()) {
      setBookingError('Please fill in all required booking fields.');
      setSubmitting(false);
      return;
    }

    const startIso = `${bookingDate}T${startTime}:00Z`;
    const endIso = `${bookingDate}T${endTime}:00Z`;

    try {
      const result = await api.bookings.create({
        resource: parseInt(id, 10),
        start_time: startIso,
        end_time: endIso,
        purpose: purpose.trim(),
      });

      setSuccessMessage(`Booking #${result.id} confirmed successfully!`);
      fetchAvailability();
      setTimeout(() => {
        router.push('/my-bookings');
      }, 1500);
    } catch (err) {
      if (err.status === 409 || err.errorCode === 'booking_conflict') {
        setBookingError('The selected time slot is no longer available. Please choose another slot.');
      } else {
        setBookingError(err.message || 'Booking creation failed. Please verify selected times.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || (!user && loading)) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Loading availability schedule...
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
              href={`/resources/${id}`}
              className="inline-flex items-center space-x-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-2xs transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Resource Details</span>
            </Link>

            <span className="text-xs text-slate-400 font-mono">Module M2/M3 • Conflict-Safe Booking Engine</span>
          </div>

          {resource && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2 text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">
                  <span>{resource.resource_type_name}</span>
                  <span>•</span>
                  <StatusBadge status={resource.status} display={resource.status_display} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{resource.name}</h2>
                <p className="text-xs text-slate-500 mt-1">Location: {resource.location} | Capacity: {resource.capacity} Seats</p>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                <div className="font-bold text-slate-800">Database Overlap Protection</div>
                <div className="text-[11px] text-emerald-700 font-mono">PostgreSQL btree_gist Range Enforcement</div>
              </div>
            </div>
          )}

          {/* Alert Banners */}
          {bookingError && (
            <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 text-red-800 text-xs font-semibold flex items-center justify-between shadow-sm animate-bounce">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{bookingError}</span>
              </div>
              <button onClick={() => setBookingError(null)} className="text-red-500 hover:text-red-700 text-xs font-bold">Dismiss</button>
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center space-x-2 shadow-sm">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>{successMessage} Redirecting to My Bookings...</span>
            </div>
          )}

          {/* Grid Layout: FullCalendar (left) + Booking Form Panel (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* FullCalendar Schedule View */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Resource Availability Calendar
                </h3>
                <span className="text-[11px] text-slate-500">Drag/Click to select booking time slot</span>
              </div>

              <div className="fullcalendar-wrapper text-xs">
                <FullCalendar
                  ref={calendarRef}
                  plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                  initialView="timeGridWeek"
                  headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'timeGridWeek,timeGridDay,dayGridMonth'
                  }}
                  slotMinTime="08:00:00"
                  slotMaxTime="21:00:00"
                  selectable={true}
                  selectMirror={true}
                  select={handleCalendarSelect}
                  events={events}
                  height="520px"
                />
              </div>
            </div>

            {/* Booking Form Panel */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Book Resource</h3>
                <p className="text-xs text-slate-500">Submit time slot for PostgreSQL conflict verification</p>
              </div>

              <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Target Resource</label>
                  <input
                    type="text"
                    readOnly
                    value={resource ? resource.name : 'Loading...'}
                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Booking Date</label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    id="booking-date-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Start Time</label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      id="booking-start-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">End Time</label>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      id="booking-end-input"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Booking Purpose & Details</label>
                  <textarea
                    required
                    rows="3"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Artificial Intelligence Research Group Experiment Session"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    id="booking-purpose-input"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
                  id="submit-booking-btn"
                >
                  {submitting ? 'Verifying Conflict-Free Slot...' : 'Confirm Booking'}
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
