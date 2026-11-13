'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { api } from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';

const CATEGORY_COLORS = ['#F58220', '#111111', '#6B6B6B', '#D96A0B', '#333333', '#F9A04D', '#888888'];

export default function AnalyticsDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // Date filters: default last 30 days
  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(thirtyDaysAgoStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [resourceId, setResourceId] = useState('');
  const [resourceList, setResourceList] = useState([]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloadingBookings, setDownloadingBookings] = useState(false);
  const [downloadingUsage, setDownloadingUsage] = useState(false);

  // Load resources for dropdown
  useEffect(() => {
    if (user && ['custodian', 'dept_head', 'facility_mgr', 'admin'].includes(user.role)) {
      api.resources.list()
        .then((res) => {
          setResourceList(res.results || res || []);
        })
        .catch(() => {});
    }
  }, [user]);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (resourceId) params.resource_id = resourceId;

      const res = await api.analytics.dashboard(params);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, resourceId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user && !['custodian', 'dept_head', 'facility_mgr', 'admin'].includes(user.role)) {
      setError('Access Denied. Only staff, custodians, department heads, and administrators may view analytics.');
      setLoading(false);
      return;
    }
    if (user) {
      loadAnalytics();
    }
  }, [user, authLoading, router, loadAnalytics]);

  const handleDownloadBookingsCsv = async () => {
    setDownloadingBookings(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (resourceId) params.resource_id = resourceId;

      const blob = await api.analytics.downloadBookingsCsv(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `p20_bookings_report_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Failed to download bookings CSV.');
    } finally {
      setDownloadingBookings(false);
    }
  };

  const handleDownloadUsageCsv = async () => {
    setDownloadingUsage(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      if (resourceId) params.resource_id = resourceId;

      const blob = await api.analytics.downloadUsageCsv(params);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `p20_resource_usage_report_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert(err.message || 'Failed to download usage CSV.');
    } finally {
      setDownloadingUsage(false);
    }
  };

  if (authLoading || (!user && !error)) {
    return (
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-[#6B6B6B] text-sm">
        Loading analytics session...
      </div>
    );
  }

  const isUnauthorized = user && !['custodian', 'dept_head', 'facility_mgr', 'admin'].includes(user.role);

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-6">
          {/* Header Bar */}
          <div className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#D96A0B] bg-[#FFF3E6] px-2.5 py-1 rounded-md border border-[#F58220]/30">
                  Module M9 • Intelligence
                </span>
                <span className="text-xs text-[#6B6B6B]">
                  Scope: {user?.role_display || user?.role} ({data?.scope || 'calculating...'})
                </span>
              </div>
              <h1 className="text-2xl font-bold text-[#111111]">Analytics & Utilization Reporting</h1>
              <p className="text-xs text-[#6B6B6B] mt-1">
                Real-time booking volume, resource operating-hours utilization, peak hours, and attendance KPIs.
              </p>
            </div>

            {/* CSV Actions */}
            {!isUnauthorized && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadBookingsCsv}
                  disabled={downloadingBookings || loading}
                  className="px-3.5 py-2 bg-white hover:bg-[#F5F5F5] text-[#111111] border border-[#111111] rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>{downloadingBookings ? 'Exporting...' : 'Export Bookings CSV'}</span>
                </button>

                <button
                  onClick={handleDownloadUsageCsv}
                  disabled={downloadingUsage || loading}
                  className="px-3.5 py-2 bg-[#F58220] hover:bg-[#D96A0B] text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#F58220]/50"
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>{downloadingUsage ? 'Exporting...' : 'Export Usage CSV'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Filter Bar */}
          {!isUnauthorized && (
            <div className="bg-white rounded-xl p-4 border border-[#E5E5E5] shadow-xs flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <label className="font-semibold text-[#111111]">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 border border-[#E5E5E5] bg-[#F5F5F5] text-[#111111] rounded-lg text-xs focus:ring-2 focus:ring-[#F58220] focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <label className="font-semibold text-[#111111]">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 border border-[#E5E5E5] bg-[#F5F5F5] text-[#111111] rounded-lg text-xs focus:ring-2 focus:ring-[#F58220] focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <label className="font-semibold text-[#111111]">Resource:</label>
                <select
                  value={resourceId}
                  onChange={(e) => setResourceId(e.target.value)}
                  className="px-3 py-1.5 border border-[#E5E5E5] bg-[#F5F5F5] text-[#111111] rounded-lg text-xs focus:ring-2 focus:ring-[#F58220] focus:outline-none"
                >
                  <option value="">All Scoped Resources</option>
                  {resourceList.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={loadAnalytics}
                className="ml-auto px-4 py-1.5 bg-white hover:bg-[#F5F5F5] text-[#111111] border border-[#111111] font-semibold rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 text-[#F58220]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start space-x-3">
              <svg className="w-5 h-5 shrink-0 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold">{error}</p>
                {isUnauthorized && (
                  <p className="mt-1 text-[#6B6B6B]">
                    Students and faculty do not have permission to view high-level institutional utilization metrics.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-28 bg-white rounded-xl border border-[#E5E5E5] p-4 animate-pulse flex flex-col justify-between">
                    <div className="h-3 bg-[#E5E5E5] rounded w-1/2"></div>
                    <div className="h-7 bg-[#E5E5E5] rounded w-3/4"></div>
                    <div className="h-2 bg-[#E5E5E5] rounded w-1/3"></div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="h-80 bg-white rounded-xl border border-[#E5E5E5] p-6 animate-pulse"></div>
                <div className="h-80 bg-white rounded-xl border border-[#E5E5E5] p-6 animate-pulse"></div>
              </div>
            </div>
          )}

          {/* Main Analytics Content */}
          {!loading && !error && data && (
            <div className="space-y-6">
              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white rounded-xl p-4 border border-[#E5E5E5] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider">Total Bookings</div>
                  <div className="text-2xl font-bold text-[#111111] mt-2">{data.summary.total_bookings}</div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1">Across scoped resources</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-[#E5E5E5] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider">Booked Hours</div>
                  <div className="text-2xl font-bold text-[#F58220] mt-2">{data.summary.total_booked_hours} hrs</div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1">Total active reservation duration</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-[#E5E5E5] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider">Avg Utilization</div>
                  <div className="text-2xl font-bold text-emerald-700 mt-2">{data.summary.average_utilization_pct}%</div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1">Of available operating capacity</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-[#E5E5E5] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider">Cancellation Rate</div>
                  <div className="text-2xl font-bold text-amber-700 mt-2">{data.performance_rates.cancellation_rate_pct}%</div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1">{data.performance_rates.cancelled_bookings} cancelled bookings</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-[#E5E5E5] shadow-xs">
                  <div className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-wider">No-Show Rate</div>
                  <div className="text-2xl font-bold text-rose-700 mt-2">{data.performance_rates.no_show_rate_pct}%</div>
                  <div className="text-[10px] text-[#6B6B6B] mt-1">{data.performance_rates.no_show_bookings} auto-released slots</div>
                </div>
              </div>

              {/* Chart Row 1: Resource Utilization & Category Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Resource Utilization Bar Chart (2 cols) */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold text-[#111111]">Resource Operating Utilization (%)</h2>
                      <p className="text-xs text-[#6B6B6B] mt-0.5">Booked duration divided by total operating schedule</p>
                    </div>
                  </div>

                  {data.utilization && data.utilization.length > 0 ? (
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.utilization} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                          <XAxis
                            dataKey="resource_name"
                            angle={-25}
                            textAnchor="end"
                            interval={0}
                            height={45}
                            tick={{ fontSize: 10, fill: '#6B6B6B' }}
                          />
                          <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                          <Tooltip
                            formatter={(val, name, item) => [`${val}% (${item.payload.booked_hours} hrs)`, 'Utilization']}
                            labelFormatter={(label) => `Resource: ${label}`}
                          />
                          <Bar dataKey="utilization_pct" fill="#F58220" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-72 flex items-center justify-center text-xs text-[#6B6B6B]">
                      No utilization data available for this range.
                    </div>
                  )}
                </div>

                {/* Bookings by Resource Category Pie Chart (1 col) */}
                <div className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-xs flex flex-col">
                  <div>
                    <h2 className="text-base font-bold text-[#111111]">Bookings by Category</h2>
                    <p className="text-xs text-[#6B6B6B] mt-0.5">Share of reservations by resource type</p>
                  </div>

                  {data.bookings_by_resource_type && data.bookings_by_resource_type.length > 0 ? (
                    <div className="h-72 w-full mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.bookings_by_resource_type}
                            dataKey="count"
                            nameKey="type_name"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={3}
                          >
                            {data.bookings_by_resource_type.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value, name, item) => [`${value} bookings (${item.payload.percentage_pct}%)`, name]} />
                          <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="h-72 flex items-center justify-center text-xs text-[#6B6B6B]">
                      No category distribution data available.
                    </div>
                  )}
                </div>
              </div>

              {/* Chart Row 2: Peak Hours & Weekday Demand */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Peak Hours Area Chart */}
                <div className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold text-[#111111]">Hourly Demand Distribution</h2>
                      <p className="text-xs text-[#6B6B6B] mt-0.5">Active booking counts by hour of day (08:00 - 21:00)</p>
                    </div>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.peak_hours} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#F58220" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#F58220" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                        <XAxis dataKey="hour_label" tick={{ fontSize: 10, fill: '#6B6B6B' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                        <Tooltip formatter={(val) => [`${val} active slots`, 'Bookings']} />
                        <Area type="monotone" dataKey="count" stroke="#F58220" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Peak Weekdays Bar Chart */}
                <div className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold text-[#111111]">Day-of-Week Distribution</h2>
                      <p className="text-xs text-[#6B6B6B] mt-0.5">Booking intensity across the academic week</p>
                    </div>
                  </div>

                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.peak_weekdays} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E5E5" />
                        <XAxis dataKey="day_name" tick={{ fontSize: 10, fill: '#6B6B6B' }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B6B6B' }} />
                        <Tooltip formatter={(val) => [`${val} bookings`, 'Total']} />
                        <Bar dataKey="count" fill="#111111" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Top Users Leaderboard */}
              <div className="bg-white rounded-2xl p-6 border border-[#E5E5E5] shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-[#111111]">Top Users Leaderboard</h2>
                    <p className="text-xs text-[#6B6B6B] mt-0.5">Highest volume campus resource bookers in date window</p>
                  </div>
                  <span className="text-[11px] text-[#6B6B6B] font-medium">Top {data.top_users?.length || 0}</span>
                </div>

                {data.top_users && data.top_users.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#E5E5E5] text-[#6B6B6B] font-semibold uppercase tracking-wider text-[10px]">
                          <th className="py-2.5 px-3">#</th>
                          <th className="py-2.5 px-3">User</th>
                          <th className="py-2.5 px-3">Role</th>
                          <th className="py-2.5 px-3">Department</th>
                          <th className="py-2.5 px-3 text-right">Bookings</th>
                          <th className="py-2.5 px-3 text-right">Total Hours</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5E5E5]">
                        {data.top_users.map((u, idx) => (
                          <tr key={u.user_id} className="hover:bg-[#F5F5F5]/70 transition-colors">
                            <td className="py-3 px-3 font-semibold text-[#6B6B6B]">{idx + 1}</td>
                            <td className="py-3 px-3">
                              <div className="font-semibold text-[#111111]">{u.full_name || u.username}</div>
                              <div className="text-[10px] text-[#6B6B6B] font-mono">@{u.username} • {u.email}</div>
                            </td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F5F5F5] text-[#111111] border border-[#E5E5E5] capitalize">
                                {u.role}
                              </span>
                            </td>
                            <td className="py-3 px-3 text-[#6B6B6B]">{u.department || 'General'}</td>
                            <td className="py-3 px-3 text-right font-bold text-[#F58220]">{u.booking_count}</td>
                            <td className="py-3 px-3 text-right font-mono text-[#111111]">{u.total_hours} hrs</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-[#6B6B6B]">
                    No user booking records found in the selected range.
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
