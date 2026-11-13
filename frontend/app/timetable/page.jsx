'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function TimetablePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Import State
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importMode, setImportMode] = useState('upload'); // 'upload' or 'text'
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const isAdminOrFacilityMgr = user && (user.role === 'admin' || user.role === 'facility_mgr' || user.is_superuser);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.timetable.list();
      setSchedules(data);
    } catch (err) {
      setError(err.message || 'Failed to load timetable schedules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && isAdminOrFacilityMgr) {
      fetchSchedules();
    } else if (user && !isAdminOrFacilityMgr) {
      setLoading(false);
    }
  }, [user, isAdminOrFacilityMgr, fetchSchedules]);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCsvText(event.target.result || '');
    };
    reader.readAsText(file);
  };

  const handleSampleDownload = () => {
    const sampleCsv = `course_code,resource_id,weekday,start_time,end_time,semester_start,semester_end
CSE301,1,Monday,09:00,11:00,2026-08-01,2026-12-15
ECE202,2,Wednesday,14:00,16:00,2026-08-01,2026-12-15
MEC105,1,Friday,10:00,12:00,2026-08-01,2026-12-15`;
    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timetable_sample_import.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportSubmit = async (e) => {
    e.preventDefault();
    if (!csvText.trim()) {
      setImportError('Please select a valid CSV file or paste CSV content.');
      return;
    }

    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const res = await api.timetable.importCsv(csvText);
      setImportResult(res);
      fetchSchedules();
    } catch (err) {
      setImportError(err.message || 'Failed to import timetable schedules.');
    } finally {
      setImporting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-[#6B6B6B] text-sm">
        Loading session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* Top Banner */}
          <div className="bg-[#111111] text-white rounded-2xl p-6 shadow-sm border border-[#222222] flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#F58220] bg-[#1c1c1c] px-2.5 py-1 rounded-md border border-[#333333] w-fit mb-2">
                <span>Timetable Schedule Engine</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Academic Timetable & Classroom Allocation</h2>
              <p className="text-neutral-300 text-xs mt-1 max-w-xl">
                Import semester academic schedules to automatically hold classroom/laboratory slots. Built-in PostgreSQL exclusion constraint automatically checks for conflicting bookings.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleSampleDownload}
                className="px-3.5 py-2 bg-[#222222] hover:bg-[#2d2d2d] text-white border border-[#333333] rounded-xl text-xs font-semibold transition-all flex items-center space-x-1.5 shadow-xs"
                id="download-sample-csv-btn"
              >
                <svg className="w-4 h-4 text-[#F58220]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Sample CSV Template</span>
              </button>
            </div>
          </div>

          {!isAdminOrFacilityMgr ? (
            <div className="bg-white rounded-2xl border border-[#E5E5E5] p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto text-xl font-bold border border-amber-200">
                !
              </div>
              <h3 className="text-base font-bold text-[#111111]">Administrator Access Required</h3>
              <p className="text-xs text-[#6B6B6B] max-w-md mx-auto">
                Timetable CSV schedule import is restricted to platform Administrators and Facility Managers. Please sign in with an administrative account to manage course allocations.
              </p>
            </div>
          ) : (
            <>
              {/* CSV Upload / Input Card */}
              <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#111111]">Import Semester Timetable CSV</h3>
                    <p className="text-xs text-[#6B6B6B]">Provide CSV containing course schedules with row-level validation</p>
                  </div>
                  <div className="flex items-center space-x-1 bg-[#F5F5F5] p-1 rounded-xl text-xs font-semibold border border-[#E5E5E5]">
                    <button
                      onClick={() => setImportMode('upload')}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        importMode === 'upload' ? 'bg-[#111111] text-white shadow-2xs' : 'text-[#6B6B6B] hover:text-[#111111]'
                      }`}
                    >
                      File Upload
                    </button>
                    <button
                      onClick={() => setImportMode('text')}
                      className={`px-3 py-1 rounded-lg transition-all ${
                        importMode === 'text' ? 'bg-[#111111] text-white shadow-2xs' : 'text-[#6B6B6B] hover:text-[#111111]'
                      }`}
                    >
                      Paste CSV
                    </button>
                  </div>
                </div>

                <form onSubmit={handleImportSubmit} className="space-y-4">
                  {importMode === 'upload' ? (
                    <div className="border-2 border-dashed border-[#E5E5E5] hover:border-[#F58220] rounded-2xl p-6 text-center transition-colors">
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={handleFileUpload}
                        className="hidden"
                        id="timetable-file-input"
                      />
                      <label htmlFor="timetable-file-input" className="cursor-pointer space-y-2 block">
                        <div className="w-10 h-10 rounded-xl bg-[#FFF3E6] text-[#F58220] flex items-center justify-center mx-auto">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div className="text-xs font-bold text-[#111111]">
                          {fileName ? `Selected: ${fileName}` : 'Click to select or drop CSV timetable file'}
                        </div>
                        <p className="text-[11px] text-[#6B6B6B]">Supported columns: course_code, resource_id, weekday, start_time, end_time, semester_start, semester_end</p>
                      </label>
                    </div>
                  ) : (
                    <div>
                      <textarea
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                        placeholder={`course_code,resource_id,weekday,start_time,end_time,semester_start,semester_end\nCSE301,1,Monday,09:00,11:00,2026-08-01,2026-12-15`}
                        rows={6}
                        className="w-full p-3 font-mono text-xs bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F58220] text-[#111111]"
                        id="timetable-csv-textarea"
                      />
                    </div>
                  )}

                  {importError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                      {importError}
                    </div>
                  )}

                  <div className="flex items-center justify-end">
                    <button
                      type="submit"
                      disabled={importing || !csvText.trim()}
                      className="px-5 py-2.5 bg-[#F58220] hover:bg-[#D96A0B] disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-2 focus:outline-none focus:ring-2 focus:ring-[#F58220]/50"
                      id="submit-timetable-import-btn"
                    >
                      {importing && (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      )}
                      <span>{importing ? 'Processing Schedule...' : 'Import & Generate Holds'}</span>
                    </button>
                  </div>
                </form>

                {/* Import Results Summary */}
                {importResult && (
                  <div className="mt-4 pt-4 border-t border-[#E5E5E5] space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-[#F5F5F5] rounded-xl border border-[#E5E5E5] text-center">
                        <div className="text-[11px] text-[#6B6B6B] font-medium">Processed Rows</div>
                        <div className="text-xl font-bold text-[#111111]">{importResult.total_rows || 0}</div>
                      </div>
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                        <div className="text-[11px] text-emerald-700 font-medium">Entries Created</div>
                        <div className="text-xl font-bold text-emerald-700">{importResult.entries_created || 0}</div>
                      </div>
                      <div className="p-3 bg-[#FFF3E6] rounded-xl border border-[#F58220]/30 text-center">
                        <div className="text-[11px] text-[#D96A0B] font-medium">Bookings Generated</div>
                        <div className="text-xl font-bold text-[#D96A0B]">{importResult.bookings_generated || 0}</div>
                      </div>
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-center">
                        <div className="text-[11px] text-amber-700 font-medium">Clashes Detected</div>
                        <div className="text-xl font-bold text-amber-700">{importResult.clashes_count || 0}</div>
                      </div>
                    </div>

                    {/* Clashes Table */}
                    {importResult.clashes && importResult.clashes.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center space-x-1.5">
                          <span>Reported Clashes with Existing Bookings ({importResult.clashes.length})</span>
                        </h4>
                        <div className="overflow-x-auto border border-amber-200 rounded-xl bg-amber-50/40">
                          <table className="min-w-full text-xs text-left">
                            <thead className="bg-amber-100/60 text-amber-900 font-bold border-b border-amber-200">
                              <tr>
                                <th className="p-2.5">Row</th>
                                <th className="p-2.5">Course</th>
                                <th className="p-2.5">Resource</th>
                                <th className="p-2.5">Date & Time</th>
                                <th className="p-2.5">Conflicting Item</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-amber-200/60 text-[#111111]">
                              {importResult.clashes.map((c, i) => (
                                <tr key={i} className="hover:bg-amber-100/40">
                                  <td className="p-2.5 font-bold text-[#6B6B6B]">Row {c.row}</td>
                                  <td className="p-2.5 font-semibold text-[#111111]">{c.course_code}</td>
                                  <td className="p-2.5">{c.resource}</td>
                                  <td className="p-2.5 font-mono">{c.date} ({c.time})</td>
                                  <td className="p-2.5 text-red-600 font-medium">{c.clashing_with}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Row Errors */}
                    {importResult.errors && importResult.errors.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider">
                          Row-Level Validation Errors ({importResult.errors.length})
                        </h4>
                        <div className="overflow-x-auto border border-red-200 rounded-xl bg-red-50/40">
                          <table className="min-w-full text-xs text-left">
                            <thead className="bg-red-100/60 text-red-900 font-bold border-b border-red-200">
                              <tr>
                                <th className="p-2.5">Row</th>
                                <th className="p-2.5">Course</th>
                                <th className="p-2.5">Validation Error Detail</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-red-200/60 text-[#111111]">
                              {importResult.errors.map((err, i) => (
                                <tr key={i} className="hover:bg-red-100/40">
                                  <td className="p-2.5 font-bold text-[#6B6B6B]">Row {err.row}</td>
                                  <td className="p-2.5 font-semibold text-[#111111]">{err.course_code || '—'}</td>
                                  <td className="p-2.5 text-red-700">{err.error}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Existing Timetable Schedules List */}
              <div className="bg-white rounded-2xl border border-[#E5E5E5] p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#111111]">Configured Timetable Schedules</h3>
                    <p className="text-xs text-[#6B6B6B]">Currently registered course schedules and allocation holds</p>
                  </div>
                  <button
                    onClick={fetchSchedules}
                    className="text-xs text-[#F58220] hover:text-[#D96A0B] underline font-semibold"
                  >
                    Refresh
                  </button>
                </div>

                {loading ? (
                  <LoadingState count={3} />
                ) : error ? (
                  <ErrorState error={error} onRetry={fetchSchedules} />
                ) : schedules.length === 0 ? (
                  <EmptyState message="No timetable schedules have been imported yet. Use the CSV importer above to register course allocations." />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {schedules.map((s) => (
                      <div key={s.id} className="p-4 bg-[#F5F5F5] rounded-xl border border-[#E5E5E5] space-y-2 hover:border-[#F58220] transition-all">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#D96A0B] bg-[#FFF3E6] px-2.5 py-0.5 rounded-md border border-[#F58220]/30">
                            {s.course_code}
                          </span>
                          <span className="text-[11px] font-semibold text-[#6B6B6B]">
                            {s.weekday_display}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-[#111111] truncate">
                          {s.resource_name}
                        </div>

                        <div className="flex items-center space-x-1.5 text-xs text-[#6B6B6B] font-mono">
                          <svg className="w-3.5 h-3.5 text-[#6B6B6B] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</span>
                        </div>

                        <div className="text-[11px] text-[#6B6B6B]">
                          Semester: {s.semester_start} &rarr; {s.semester_end}
                        </div>

                        <div className="pt-2 border-t border-[#E5E5E5] flex items-center justify-between">
                          <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            {s.held_bookings_count} slots held
                          </span>
                          <Link
                            href={`/resources/${s.resource}/availability`}
                            className="text-xs font-bold text-[#F58220] hover:text-[#D96A0B] underline"
                          >
                            View Calendar &rarr;
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
