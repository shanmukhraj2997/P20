'use client';

import React, { useState } from 'react';
import { api } from '@/lib/api';
import StatusBadge from './StatusBadge';

export default function QrScanModal({ isOpen, onClose, onCheckedIn }) {
  const [tokenInput, setTokenInput] = useState('');
  const [resourceIdInput, setResourceIdInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [resultBooking, setResultBooking] = useState(null);

  if (!isOpen) return null;

  const handleVerifyCheckIn = async (e) => {
    e.preventDefault();
    let rawToken = tokenInput.trim();
    if (!rawToken) {
      setErrorMsg('Please enter or scan a valid check-in token.');
      return;
    }

    let finalToken = rawToken;
    let finalResId = resourceIdInput.trim();

    // Auto-parse if hardware/mobile scanner pastes the full QR JSON payload
    if (rawToken.startsWith('{') && rawToken.endsWith('}')) {
      try {
        const parsed = JSON.parse(rawToken);
        if (parsed.token) finalToken = String(parsed.token);
        if (parsed.resource_id && !finalResId) finalResId = String(parsed.resource_id);
      } catch {
        // Keep rawToken if not JSON
      }
    }

    setSubmitting(true);
    setErrorMsg(null);
    setResultBooking(null);

    try {
      const payload = { token: finalToken };
      if (finalResId) {
        payload.resource_id = parseInt(finalResId, 10);
      }
      const resp = await api.bookings.checkInWithToken(payload);
      setResultBooking(resp.booking);
      if (onCheckedIn) {
        onCheckedIn(resp.booking);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Check-in validation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setTokenInput('');
    setResourceIdInput('');
    setErrorMsg(null);
    setResultBooking(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#111111]/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-[#E5E5E5] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#111111] border-b border-[#222222] p-6 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#F58220]/20 border border-[#F58220]/40 flex items-center justify-center">
              <svg className="w-5 h-5 text-[#F58220]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Scanner Verification</h2>
              <p className="text-xs text-[#6B6B6B]">Desk check-in & QR token validation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 text-xs flex items-start space-x-2">
              <svg className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="font-semibold">{errorMsg}</div>
            </div>
          )}

          {resultBooking ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-3">
                <div className="flex items-center space-x-2 text-emerald-800 font-bold text-sm">
                  <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Check-In Verified!</span>
                </div>
                <div className="space-y-1 text-xs text-[#111111]">
                  <div><strong>Booking ID:</strong> #{resultBooking.id}</div>
                  <div><strong>Resource:</strong> {resultBooking.resource_name}</div>
                  <div><strong>Requester:</strong> {resultBooking.requester_name}</div>
                  <div><strong>Status:</strong> <StatusBadge status={resultBooking.status} display={resultBooking.status_display} /></div>
                </div>
              </div>

              <button
                onClick={handleReset}
                className="w-full py-2.5 rounded-xl bg-[#F58220] hover:bg-[#D96A0B] text-white font-bold text-xs transition-all shadow-sm focus:ring-2 focus:ring-[#F58220] cursor-pointer"
              >
                Scan Next Token
              </button>
            </div>
          ) : (
            <form onSubmit={handleVerifyCheckIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  QR Check-In Token (UUID) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste or scan token (e.g. b29a17ce-...)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E5E5] bg-[#F5F5F5] font-mono text-xs text-[#111111] focus:bg-white focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">
                  Resource ID (Optional matching verification)
                </label>
                <input
                  type="number"
                  value={resourceIdInput}
                  onChange={(e) => setResourceIdInput(e.target.value)}
                  placeholder="e.g. 1"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E5E5] bg-[#F5F5F5] text-xs text-[#111111] focus:bg-white focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] transition-all"
                />
              </div>

              <div className="pt-2 flex items-center space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-[#111111] text-xs font-semibold text-[#111111] hover:bg-[#F5F5F5] transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-sm flex items-center justify-center space-x-1.5 cursor-pointer ${
                    submitting
                      ? 'bg-[#6B6B6B] cursor-not-allowed'
                      : 'bg-[#F58220] hover:bg-[#D96A0B] active:scale-98 focus:ring-2 focus:ring-[#F58220]'
                  }`}
                >
                  {submitting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Verify Check-In</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
