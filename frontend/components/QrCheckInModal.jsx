'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import StatusBadge from './StatusBadge';

export default function QrCheckInModal({ booking, isOpen, onClose, onCheckedIn, isStaff = false }) {
  const [loadingQr, setLoadingQr] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && booking?.id) {
      setLoadingQr(true);
      setErrorMsg(null);
      setSuccessMsg(null);
      setCopied(false);

      api.bookings.getQr(booking.id)
        .then((data) => {
          setQrData(data);
          setLoadingQr(false);
        })
        .catch((err) => {
          setErrorMsg(err.message || 'Failed to load QR access token.');
          setLoadingQr(false);
        });
    } else {
      setQrData(null);
    }
  }, [isOpen, booking]);

  if (!isOpen || !booking) return null;

  const currentStatus = qrData?.status || booking.status;
  const isCheckedIn = currentStatus === 'checked_in';
  const canCheckIn = qrData?.can_check_in || isStaff;

  const formatSlotTime = (isoString) => {
    if (!isoString) return '';
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
      return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const handleCheckIn = async (force = false) => {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const resp = await api.bookings.checkIn(booking.id, {
        resource_id: booking.resource,
        force: force || isStaff
      });
      setSuccessMsg(resp.message || 'Check-in successful!');
      if (resp.booking) {
        setQrData((prev) => ({
          ...prev,
          status: resp.booking.status,
          status_display: resp.booking.status_display,
          checked_in_at: resp.booking.checked_in_at,
          can_check_in: false,
        }));
      }
      if (onCheckedIn) {
        onCheckedIn(resp.booking || booking);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Check-in validation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToken = () => {
    const token = qrData?.checkin_token || booking.checkin_token;
    if (token) {
      if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(String(token)).catch(() => {});
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 text-white flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono uppercase tracking-wider text-indigo-300">Campus Access Pass</span>
              <span className="text-xs bg-indigo-800/80 px-2 py-0.5 rounded-full font-mono">#{booking.id}</span>
            </div>
            <h2 className="text-lg font-bold mt-1 text-white">{booking.resource_name}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-all"
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Booking Summary Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">Location</div>
              <div className="text-xs font-semibold text-slate-800">{booking.resource_location || 'Campus Facility'}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500 font-medium">Scheduled Time</div>
              <div className="text-xs font-semibold text-slate-800">
                {formatSlotDate(booking.start_time)} • {formatSlotTime(booking.start_time)} – {formatSlotTime(booking.end_time)}
              </div>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
              <div className="text-xs text-slate-500 font-medium">Check-In Status</div>
              <StatusBadge status={currentStatus} display={qrData?.status_display || booking.status_display} />
            </div>
          </div>

          {/* Error & Success Banners */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start space-x-2">
              <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="font-medium leading-relaxed">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center space-x-2">
              <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <div className="font-semibold">{successMsg}</div>
            </div>
          )}

          {/* QR Code Presentation */}
          <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border-2 border-dashed border-slate-200">
            {loadingQr ? (
              <div className="w-52 h-52 flex flex-col items-center justify-center space-y-2 text-slate-400">
                <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs">Generating secure QR code...</span>
              </div>
            ) : qrData?.qr_data_url ? (
              <div className="relative group">
                <img
                  src={qrData.qr_data_url}
                  alt="Booking Check-In QR Code"
                  className="w-52 h-52 object-contain rounded-xl shadow-xs transition-transform group-hover:scale-102"
                />
                {isCheckedIn && (
                  <div className="absolute inset-0 bg-emerald-950/40 backdrop-blur-2xs rounded-xl flex flex-col items-center justify-center text-white p-3 text-center">
                    <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg mb-2">
                      <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider">Checked In</span>
                    {qrData.checked_in_at && (
                      <span className="text-[10px] text-emerald-200 mt-0.5">{formatSlotTime(qrData.checked_in_at)}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-52 h-52 flex items-center justify-center text-slate-400 text-xs">
                QR code unavailable
              </div>
            )}

            {/* Token Copy Section */}
            <div className="mt-3 flex items-center space-x-2 w-full justify-center">
              <span className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]">
                {qrData?.checkin_token || booking.checkin_token || 'Token loading...'}
              </span>
              <button
                onClick={copyToken}
                className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                title="Copy verification token"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Window Information Note */}
          <div className="text-[11px] text-slate-500 text-center leading-relaxed">
            {isCheckedIn ? (
              <span className="text-emerald-700 font-medium">
                ✓ Check-in completed. Resource access is officially logged.
              </span>
            ) : (
              <span>
                Present this QR code at the facility scanner or verify below. Check-in opens 15 minutes before the session starts.
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
            >
              Close
            </button>

            {isCheckedIn ? (
              <button
                disabled
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-400 cursor-not-allowed flex items-center justify-center space-x-1"
              >
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>Checked In</span>
              </button>
            ) : !canCheckIn ? (
              <button
                disabled
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-100 text-xs font-semibold text-slate-400 cursor-not-allowed flex items-center justify-center space-x-1"
                title="Check-in window opens 15 minutes prior to scheduled start."
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Window Closed</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleCheckIn(false)}
                disabled={submitting}
                className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold text-white transition-all shadow-sm flex items-center justify-center space-x-1.5 ${
                  submitting
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98'
                }`}
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Check In Now</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

