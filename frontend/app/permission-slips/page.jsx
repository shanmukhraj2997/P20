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

export default function PermissionSlipsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState('list'); // 'list' or 'submit'
  const [slips, setSlips] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // Form State
  const [referenceNumber, setReferenceNumber] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [department, setDepartment] = useState('');
  const [purpose, setPurpose] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');
  const [issuingAuthorityName, setIssuingAuthorityName] = useState('');
  const [issuingAuthorityDesignation, setIssuingAuthorityDesignation] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [documentFile, setDocumentFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Modal State
  const [selectedSlip, setSelectedSlip] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      setDepartment(user.department || '');
    }
  }, [user]);

  const fetchResources = useCallback(async () => {
    try {
      const data = await api.resources.list();
      setResources(Array.isArray(data) ? data : data.results || []);
    } catch {
      // Ignored
    }
  }, []);

  const fetchSlips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.permissionSlips.list();
      setSlips(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch permission slips.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchResources();
      fetchSlips();
    }
  }, [user, fetchResources, fetchSlips]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    if (!documentFile) {
      setFeedback({ type: 'error', message: 'Official signed permission document (PDF, JPG, PNG) is mandatory.' });
      setSubmitting(false);
      return;
    }

    if (new Date(endDateTime) <= new Date(startDateTime)) {
      setFeedback({ type: 'error', message: 'Allocation end date & time must be strictly after start date & time.' });
      setSubmitting(false);
      return;
    }

    try {
      const formData = new FormData();
      formData.append('reference_number', referenceNumber.trim());
      formData.append('resource', resourceId);
      formData.append('department', department.trim());
      formData.append('purpose', purpose.trim());
      formData.append('start_datetime', new Date(startDateTime).toISOString());
      formData.append('end_datetime', new Date(endDateTime).toISOString());
      formData.append('issuing_authority_name', issuingAuthorityName.trim());
      formData.append('issuing_authority_designation', issuingAuthorityDesignation.trim());
      formData.append('issue_date', issueDate);
      formData.append('uploaded_document', documentFile);

      await api.permissionSlips.create(formData);
      setFeedback({
        type: 'success',
        message: `Permission Slip [${referenceNumber}] submitted successfully for university administrative verification.`
      });

      // Reset form
      setReferenceNumber('');
      setResourceId('');
      setPurpose('');
      setStartDateTime('');
      setEndDateTime('');
      setIssuingAuthorityName('');
      setIssuingAuthorityDesignation('');
      setDocumentFile(null);
      setActiveTab('list');
      fetchSlips();
    } catch (err) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit permission slip.' });
    } finally {
      setSubmitting(false);
    }
  };

  const isVerifierRole = user && ['dept_head', 'facility_mgr', 'admin'].includes(user.role);

  if (authLoading) return <LoadingState />;

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
                  Official University Permission Slips
                </h1>
                <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-medium">
                  Verified Allocation
                </span>
              </div>
              <p className="text-sm text-white/60 mt-1">
                Submit official paper permissions, track verification progress, and secure officially priority allocated rooms.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {isVerifierRole && (
                <Link
                  href="/permission-slips/verify"
                  className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition shadow flex items-center gap-1.5"
                >
                  <span>Verification Dashboard</span>
                  <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">Admin</span>
                </Link>
              )}
              <button
                onClick={() => setActiveTab(activeTab === 'list' ? 'submit' : 'list')}
                className="bg-[#F58220] hover:bg-[#D96A0B] text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition shadow"
              >
                {activeTab === 'list' ? '+ Submit Permission Slip' : '← View Submitted Slips'}
              </button>
            </div>
          </div>

          {/* Feedback Banner */}
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

          {activeTab === 'submit' ? (
            /* Submission Form */
            <div className="bg-[#141414] border border-white/10 rounded-2xl p-6 md:p-8 shadow-xl max-w-4xl mx-auto space-y-6">
              <div className="border-b border-white/10 pb-4">
                <h2 className="text-lg font-bold text-white">Submit Official Permission Slip</h2>
                <p className="text-xs text-white/60 mt-0.5">
                  Attach signed university documentation for classroom, laboratory, or hall allocation.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1.5">
                      Official Reference Number *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. UNIV/2026/CS/401"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F58220]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1.5">
                      Target Resource / Facility *
                    </label>
                    <select
                      required
                      value={resourceId}
                      onChange={(e) => setResourceId(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F58220]"
                    >
                      <option value="">Select Resource...</option>
                      {resources.map((res) => (
                        <option key={res.id} value={res.id}>
                          {res.name} ({res.location || 'Campus'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1.5">
                      Requesting Department *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Computer Science & Engineering"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F58220]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1.5">
                      Permission Issue Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F58220]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1.5">
                      Issuing Authority Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. H. S. Sharma"
                      value={issuingAuthorityName}
                      onChange={(e) => setIssuingAuthorityName(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F58220]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1.5">
                      Issuing Authority Designation *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dean of Academic Affairs / Registrar"
                      value={issuingAuthorityDesignation}
                      onChange={(e) => setIssuingAuthorityDesignation(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F58220]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1.5">
                      Allocation Start Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={startDateTime}
                      onChange={(e) => setStartDateTime(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F58220]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-white/80 mb-1.5">
                      Allocation End Date & Time *
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={endDateTime}
                      onChange={(e) => setEndDateTime(e.target.value)}
                      className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F58220]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1.5">
                    Official Purpose & Event Description *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe the academic event, guest lecture, examination, or administrative session..."
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#F58220]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/80 mb-1.5">
                    Scanned Permission Slip Document (PDF, JPG, PNG &le; 10MB) *
                  </label>
                  <input
                    type="file"
                    required
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setDocumentFile(e.target.files[0] || null)}
                    className="w-full bg-[#1C1C1C] border border-white/10 rounded-xl p-2.5 text-xs text-white/80 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F58220] file:text-white hover:file:bg-[#D96A0B]"
                  />
                  <p className="text-[11px] text-white/40 mt-1">
                    Upload official certified order slip. Submissions remain unverified until administrative verification.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-medium rounded-xl transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 bg-[#F58220] hover:bg-[#D96A0B] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition shadow"
                  >
                    {submitting ? 'Submitting Document...' : 'Submit Permission Slip'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* Submissions List */
            <div>
              {loading ? (
                <div className="p-12 text-center text-white/50 text-xs">Loading permission slips...</div>
              ) : error ? (
                <div className="p-6 bg-red-950/20 border border-red-500/30 rounded-xl text-red-300 text-sm">
                  {error}
                </div>
              ) : slips.length === 0 ? (
                <EmptyState
                  title="No Permission Slips Submitted"
                  description="You have not submitted any official university permission slips yet."
                />
              ) : (
                <div className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-white/80">
                      <thead className="bg-white/5 text-white/60 uppercase font-semibold text-[11px] border-b border-white/10">
                        <tr>
                          <th className="px-4 py-3.5">Reference #</th>
                          <th className="px-4 py-3.5">Resource / Facility</th>
                          <th className="px-4 py-3.5">Department</th>
                          <th className="px-4 py-3.5">Schedule Time</th>
                          <th className="px-4 py-3.5">Issuing Authority</th>
                          <th className="px-4 py-3.5">Verification Status</th>
                          <th className="px-4 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-normal">
                        {slips.map((slip) => {
                          const getBadgeColor = (st) => {
                            switch (st) {
                              case 'allocated': return 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30';
                              case 'verified': return 'bg-purple-900/40 text-purple-300 border-purple-500/30';
                              case 'under_review': return 'bg-amber-900/40 text-amber-300 border-amber-500/30';
                              case 'rejected': return 'bg-rose-900/40 text-rose-300 border-rose-500/30';
                              case 'cancelled': return 'bg-neutral-800 text-neutral-400 border-neutral-700';
                              default: return 'bg-blue-900/40 text-blue-300 border-blue-500/30';
                            }
                          };

                          return (
                            <tr key={slip.id} className="hover:bg-white/[0.02] transition">
                              <td className="px-4 py-3.5 font-mono text-white font-semibold">
                                {slip.reference_number}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="font-semibold text-white">{slip.resource_name}</div>
                                <div className="text-[11px] text-white/50">{slip.resource_location}</div>
                              </td>
                              <td className="px-4 py-3.5 text-white/70">
                                {slip.department}
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
                                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${getBadgeColor(slip.verification_status)}`}>
                                  {slip.status_display}
                                </span>
                              </td>
                              <td className="px-4 py-3.5 text-right space-x-2">
                                <button
                                  onClick={() => setSelectedSlip(slip)}
                                  className="text-xs bg-white/10 hover:bg-white/20 text-white font-medium px-3 py-1.5 rounded-lg transition"
                                >
                                  Details & Audit
                                </button>
                                {slip.document_url && (
                                  <a
                                    href={slip.document_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-[#F58220] hover:underline"
                                  >
                                    View Slip
                                  </a>
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
            </div>
          )}

          {/* Details & Audit Trail Modal */}
          {selectedSlip && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
              <div className="bg-[#141414] border border-white/10 rounded-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[10px] font-mono uppercase text-[#F58220] tracking-wider font-semibold">
                      Permission Slip Details
                    </span>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      {selectedSlip.reference_number}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedSlip(null)}
                    className="text-white/50 hover:text-white text-lg font-mono"
                  >
                    ✕
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-white/50 block">Resource:</span>
                    <span className="font-semibold text-white">{selectedSlip.resource_name}</span>
                  </div>
                  <div>
                    <span className="text-white/50 block">Department:</span>
                    <span className="text-white">{selectedSlip.department}</span>
                  </div>
                  <div>
                    <span className="text-white/50 block">Schedule:</span>
                    <span className="text-white font-mono">
                      {new Date(selectedSlip.start_datetime).toLocaleString()} – {new Date(selectedSlip.end_datetime).toLocaleTimeString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-white/50 block">Issuing Authority:</span>
                    <span className="text-white">
                      {selectedSlip.issuing_authority_name} ({selectedSlip.issuing_authority_designation})
                    </span>
                  </div>
                  <div>
                    <span className="text-white/50 block">Verification Status:</span>
                    <span className="font-semibold text-purple-400 capitalize">{selectedSlip.status_display}</span>
                  </div>
                  <div>
                    <span className="text-white/50 block">Verified By:</span>
                    <span className="text-white">{selectedSlip.verified_by_name || 'Pending Review'}</span>
                  </div>
                </div>

                <div className="text-xs bg-[#1C1C1C] p-3 rounded-xl border border-white/10">
                  <span className="text-white/50 block mb-1">Official Purpose:</span>
                  <p className="text-white/90 italic">{selectedSlip.purpose}</p>
                </div>

                {selectedSlip.conflict_override_reason && (
                  <div className="text-xs bg-purple-950/30 p-3 rounded-xl border border-purple-500/30">
                    <span className="text-purple-300 font-bold block mb-1">Displacement Justification:</span>
                    <p className="text-purple-200">{selectedSlip.conflict_override_reason}</p>
                  </div>
                )}

                {/* Audit Trail Timeline */}
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <h4 className="text-xs font-bold uppercase text-white/70 tracking-wider">
                    Immutable Audit Trail
                  </h4>
                  {selectedSlip.audit_logs && selectedSlip.audit_logs.length > 0 ? (
                    <div className="space-y-2">
                      {selectedSlip.audit_logs.map((log) => (
                        <div
                          key={log.id}
                          className="text-[11px] bg-white/5 p-2.5 rounded-lg border border-white/5 flex items-start justify-between"
                        >
                          <div>
                            <span className="font-semibold text-[#F58220] uppercase">{log.action}</span>
                            <span className="text-white/50 ml-2">by {log.performed_by_name}</span>
                            {log.notes && <div className="text-white/80 mt-1">{log.notes}</div>}
                          </div>
                          <span className="text-white/40 font-mono shrink-0 ml-4">
                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-white/40 text-xs italic">No audit records available.</div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                  {selectedSlip.document_url && (
                    <a
                      href={selectedSlip.document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-xl transition"
                    >
                      Download Attached Document
                    </a>
                  )}
                  <button
                    onClick={() => setSelectedSlip(null)}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-xl transition"
                  >
                    Close
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
