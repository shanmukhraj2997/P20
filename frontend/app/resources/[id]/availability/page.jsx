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
  const [availableConsumables, setAvailableConsumables] = useState([]);
  const [selectedConsumables, setSelectedConsumables] = useState({});
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

  // Load Resource details and available consumables
  useEffect(() => {
    if (user && id) {
      api.resources.get(id)
        .then((data) => setResource(data))
        .catch((err) => setError(err.message || 'Failed to load resource details.'));

      api.consumables.list({ resource: id })
        .then((data) => {
          const items = Array.isArray(data) ? data : data.results || [];
          setAvailableConsumables(items);
        })
        .catch(() => {});
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

    const startDateObj = new Date(`${bookingDate}T${startTime}:00`);
    const endDateObj = new Date(`${bookingDate}T${endTime}:00`);

    if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
      setBookingError('Invalid date or time format provided.');
      setSubmitting(false);
      return;
    }

    if (startDateObj >= endDateObj) {
      setBookingError('End time must be strictly after start time.');
      setSubmitting(false);
      return;
    }

    const startIso = startDateObj.toISOString();
    const endIso = endDateObj.toISOString();

    const consumablesPayload = Object.entries(selectedConsumables)
      .filter(([_, qty]) => qty > 0)
      .map(([cid, qty]) => ({ consumable_id: parseInt(cid, 10), quantity: qty }));

    try {
      const result = await api.bookings.create({
        resource: parseInt(id, 10),
        start_time: startIso,
        end_time: endIso,
        purpose: purpose.trim(),
        consumables: consumablesPayload,
      });

      setSuccessMessage(`Booking #${result.id} confirmed successfully!`);
      fetchAvailability();
      setTimeout(() => {
        router.push('/my-bookings');
      }, 1500);
    } catch (err) {
      if (err.status === 409 || err.errorCode === 'booking_conflict') {
        setBookingError('DATABASE CONFLICT (HTTP 409): The requested time slot is already reserved for this resource. PostgreSQL btree_gist exclusion constraint prevented overlapping reservations. Please select an available slot.');
      } else {
        setBookingError(err.message || 'Booking creation failed. Please verify selected times.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || (!user && loading)) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-[#6B6B6B] text-sm">
        Loading availability schedule...
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
              href={`/resources/${id}`}
              className="inline-flex items-center space-x-2 text-xs font-semibold text-[#111111] hover:text-[#F58220] bg-white px-3.5 py-2 rounded-xl border border-[#E5E5E5] hover:border-[#F58220] shadow-2xs transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Resource Details</span>
            </Link>

            <span className="text-xs text-[#6B6B6B] font-mono">Module M2/M3 • Conflict-Safe Booking Engine</span>
          </div>

          {resource && (
            <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2 text-xs text-[#F58220] font-bold uppercase tracking-wider mb-1">
                  <span>{resource.resource_type_name}</span>
                  <span>•</span>
                  <StatusBadge status={resource.status} display={resource.status_display} />
                </div>
                <h2 className="text-2xl font-bold text-[#111111]">{resource.name}</h2>
                <p className="text-xs text-[#6B6B6B] mt-1">Location: {resource.location} | Capacity: {resource.capacity} Seats</p>
              </div>

              <div className="bg-[#F5F5F5] p-3 rounded-xl border border-[#E5E5E5] text-xs">
                <div className="font-bold text-[#111111]">Database Overlap Protection</div>
                <div className="text-[11px] text-emerald-800 font-mono font-semibold">PostgreSQL btree_gist Range Enforcement</div>
              </div>
            </div>
          )}

          {/* Alert Banners */}
          {bookingError && (
            <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs font-semibold flex items-start justify-between shadow-xs">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="space-y-0.5">
                  <div className="font-bold text-rose-800">Booking Conflict Prevented</div>
                  <div className="text-rose-700 leading-relaxed">{bookingError}</div>
                </div>
              </div>
              <button onClick={() => setBookingError(null)} className="text-rose-700 hover:text-rose-900 text-xs font-bold shrink-0 ml-4 cursor-pointer">Dismiss</button>
            </div>
          )}

          {successMessage && (
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center space-x-3 shadow-xs">
              <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>{successMessage} Redirecting to My Bookings...</span>
            </div>
          )}

          {/* Grid Layout: FullCalendar (left) + Booking Form Panel (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* FullCalendar Schedule View */}
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-[#E5E5E5] gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#111111] uppercase tracking-wider">
                    Resource Availability Calendar
                  </h3>
                  <span className="text-[11px] text-[#6B6B6B]">Drag or click any empty slot to select a booking time</span>
                </div>

                {/* Calendar Color Legend */}
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-[#111111] bg-[#F5F5F5] px-3 py-1.5 rounded-xl border border-[#E5E5E5]">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed] inline-block shadow-2xs"></span>
                    <span className="font-semibold text-purple-700">Official Allocation</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#F58220] inline-block shadow-2xs"></span>
                    <span>My Booking</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#444444] inline-block shadow-2xs"></span>
                    <span>Reserved</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#b91c1c] inline-block shadow-2xs"></span>
                    <span>Blackout</span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block shadow-2xs"></span>
                    <span>Available</span>
                  </div>
                </div>
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
                  eventContent={(eventInfo) => {
                    const isOfficial = eventInfo.event.extendedProps?.is_official || eventInfo.event.extendedProps?.badge;
                    return (
                      <div className="p-0.5 overflow-hidden text-[10px] leading-tight w-full">
                        <div className="font-bold truncate">{eventInfo.event.title}</div>
                        {isOfficial && (
                          <div className="bg-purple-950/90 text-purple-200 border border-purple-400/50 text-[8px] font-bold px-1 rounded mt-0.5 inline-block">
                            OFFICIAL UNIVERSITY ALLOCATION
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
              </div>
            </div>

            {/* Booking Form Panel */}
            <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs space-y-4">
              <div className="border-b border-[#E5E5E5] pb-3">
                <h3 className="text-sm font-bold text-[#111111]">Book Resource</h3>
                <p className="text-xs text-[#6B6B6B]">Submit time slot for PostgreSQL conflict verification</p>
              </div>

              <form onSubmit={handleBookingSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">Target Resource</label>
                  <input
                    type="text"
                    readOnly
                    value={resource ? resource.name : 'Loading...'}
                    className="w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg text-xs font-medium text-[#111111] cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">Booking Date</label>
                  <input
                    type="date"
                    required
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-lg text-xs text-[#111111] focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] focus:outline-none"
                    id="booking-date-input"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">Start Time</label>
                    <input
                      type="time"
                      required
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-lg text-xs text-[#111111] focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] focus:outline-none"
                      id="booking-start-input"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#111111] mb-1">End Time</label>
                    <input
                      type="time"
                      required
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-lg text-xs text-[#111111] focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] focus:outline-none"
                      id="booking-end-input"
                    />
                  </div>
                </div>

                {/* Duration Presets */}
                <div className="flex items-center space-x-2 pt-1">
                  <span className="text-[11px] text-[#6B6B6B]">Quick Duration:</span>
                  {[1, 2, 3].map((hours) => (
                    <button
                      key={hours}
                      type="button"
                      onClick={() => {
                        if (startTime) {
                          const [h, m] = startTime.split(':').map(Number);
                          const endH = Math.min(21, h + hours);
                          setEndTime(`${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                        }
                      }}
                      className="px-2 py-0.5 bg-[#F5F5F5] hover:bg-[#FFF3E6] hover:text-[#D96A0B] text-[#111111] rounded text-[11px] font-semibold border border-[#E5E5E5] hover:border-[#F58220] transition-colors cursor-pointer"
                    >
                      +{hours}h
                    </button>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">Booking Purpose & Details</label>
                  <textarea
                    required
                    rows="3"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    placeholder="e.g. Artificial Intelligence Research Group Experiment Session"
                    className="w-full px-3 py-2 bg-white border border-[#E5E5E5] rounded-lg text-xs text-[#111111] placeholder-[#6B6B6B] focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] focus:outline-none"
                    id="booking-purpose-input"
                  ></textarea>
                </div>

                {/* Optional Consumables Allocation */}
                {availableConsumables.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#E5E5E5]">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#111111]">Reserve Consumables</label>
                      <span className="text-[10px] text-[#6B6B6B] font-medium">Optional</span>
                    </div>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {availableConsumables.map((c) => {
                        const qty = selectedConsumables[c.id] || 0;
                        const isOut = c.stock <= 0;
                        return (
                          <div key={c.id} className="flex items-center justify-between p-2 rounded-xl bg-[#F5F5F5] border border-[#E5E5E5] text-xs">
                            <div className="min-w-0 pr-2">
                              <p className="font-semibold text-[#111111] truncate">{c.name}</p>
                              <p className="text-[10px] text-[#6B6B6B]">
                                {isOut ? (
                                  <span className="text-rose-600 font-semibold">Out of Stock</span>
                                ) : (
                                  <span>{c.stock} {c.unit} available</span>
                                )}
                              </p>
                            </div>
                            {!isOut ? (
                              <div className="flex items-center space-x-2 shrink-0">
                                <button
                                  type="button"
                                  disabled={qty <= 0}
                                  onClick={() => setSelectedConsumables(prev => ({ ...prev, [c.id]: Math.max(0, qty - 1) }))}
                                  className="w-6 h-6 rounded-lg bg-white border border-[#E5E5E5] text-[#111111] font-bold flex items-center justify-center hover:bg-[#F5F5F5] disabled:opacity-40 cursor-pointer"
                                >
                                  -
                                </button>
                                <span className="w-5 text-center font-bold text-[#111111]">{qty}</span>
                                <button
                                  type="button"
                                  disabled={qty >= c.stock}
                                  onClick={() => setSelectedConsumables(prev => ({ ...prev, [c.id]: Math.min(c.stock, qty + 1) }))}
                                  className="w-6 h-6 rounded-lg bg-white border border-[#E5E5E5] text-[#111111] font-bold flex items-center justify-center hover:bg-[#F5F5F5] disabled:opacity-40 cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-[#6B6B6B] italic">Unavailable</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-[#F58220] hover:bg-[#D96A0B] text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50 focus:ring-2 focus:ring-[#F58220] cursor-pointer"
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
