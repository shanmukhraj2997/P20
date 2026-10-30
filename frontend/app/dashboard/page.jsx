'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { api } from '@/lib/api';
import Link from 'next/link';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [healthStatus, setHealthStatus] = useState({ status: 'checking...', ok: false });
  const [healthLoading, setHealthLoading] = useState(true);
  const [stats, setStats] = useState({
    total_resources: 0,
    available_resources: 0,
    my_bookings: 0,
    upcoming_bookings: 0,
    system_active_reservations: 0,
  });
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const checkHealth = async () => {
    setHealthLoading(true);
    try {
      const res = await api.health();
      if (res.status === 'ok') {
        setHealthStatus({ status: 'API Healthy (200 OK)', ok: true });
      } else {
        setHealthStatus({ status: 'Degraded', ok: false });
      }
    } catch (err) {
      setHealthStatus({ status: 'Disconnected', ok: false });
    } finally {
      setHealthLoading(false);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const data = await api.dashboardStats();
      setStats(data);
    } catch (err) {
      // Fallback
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      checkHealth();
      loadStats();
    }
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Loading campus session...
      </div>
    );
  }

  const roleDescriptions = {
    student: 'Access classroom bookings, lab schedules, study equipment, and view active reservations.',
    faculty: 'Manage academic lab slots, seminar halls, classroom reservations, and timetable integration.',
    custodian: 'Oversee assigned lab equipment, check-in verifications, and resource maintenance logs.',
    dept_head: 'Approve department resource requests, manage faculty allocations, and review usage reports.',
    facility_mgr: 'Global facility oversight, maintenance downtime scheduling, and consumables inventory.',
    admin: 'Full system administration, user role assignments, permission rules, and audit logs.',
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-6">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 bg-indigo-950/80 px-2.5 py-1 rounded-md border border-indigo-800">
                  Role: {user.role_display || user.role}
                </span>
                <span className="text-xs text-slate-400">Department: {user.department || 'General'}</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Welcome back, {user.first_name || user.username}!</h2>
              <p className="text-slate-300 text-xs mt-1 max-w-xl">
                {roleDescriptions[user.role] || 'Campus resource, laboratory and facility management.'}
              </p>
            </div>

            {/* API Health Check Status Box */}
            <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700 min-w-[220px]">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Backend System Status
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white">Django REST API</span>
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${healthStatus.ok ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
              </div>
              <div className="text-xs text-slate-300 mt-1 font-mono">{healthStatus.status}</div>
              <button
                onClick={checkHealth}
                disabled={healthLoading}
                className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 underline font-medium"
                id="recheck-health-btn"
              >
                {healthLoading ? 'Ping...' : 'Re-check /api/health/'}
              </button>
            </div>
          </div>

          {/* Quick Metrics Shell with Live Data */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-500 font-medium">Total Resources</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {statsLoading ? '...' : stats.total_resources}
              </div>
              <div className="text-[11px] text-indigo-600 font-medium mt-1">
                Campus laboratories & facilities
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-500 font-medium">Available Resources</div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {statsLoading ? '...' : stats.available_resources}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Ready for immediate reservation
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-500 font-medium">Upcoming Bookings</div>
              <div className="text-2xl font-bold text-indigo-600 mt-1">
                {statsLoading ? '...' : stats.upcoming_bookings}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Scheduled future slots
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-500 font-medium">
                {['custodian', 'facility_mgr', 'admin'].includes(user.role) ? 'Pending Reviews' : 'My Reservations'}
              </div>
              <div className="text-2xl font-bold text-purple-600 mt-1">
                {statsLoading
                  ? '...'
                  : ['custodian', 'facility_mgr', 'admin'].includes(user.role)
                  ? stats.pending_approvals
                  : stats.my_bookings}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {['custodian', 'facility_mgr', 'admin'].includes(user.role) ? 'Awaiting custodian action' : 'Total user reservations'}
              </div>
            </div>
          </div>

          {/* Recent Reservations Table/Card */}
          {stats.recent_bookings && stats.recent_bookings.length > 0 && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Your Recent Activity</h3>
                  <p className="text-xs text-slate-500">Most recent campus reservations</p>
                </div>
                <Link href="/my-bookings" className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline">
                  View All &rarr;
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {stats.recent_bookings.map((rb) => (
                  <div key={rb.id} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-indigo-600">#{rb.id}</span>
                      <span className="capitalize font-semibold text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-full text-[10px]">
                        {rb.status}
                      </span>
                    </div>
                    <div className="text-xs font-bold text-slate-900 truncate">{rb.resource_name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{rb.resource_location}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Flow Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/resources"
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all group flex items-center justify-between"
              id="dashboard-browse-btn"
            >
              <div>
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Step 1</span>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors mt-0.5">
                  Browse Campus Catalogue &rarr;
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Search laboratories, smart classrooms, conference halls, and equipment.
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                &rarr;
              </div>
            </Link>

            <Link
              href="/my-bookings"
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs hover:shadow-md transition-all group flex items-center justify-between"
              id="dashboard-my-bookings-btn"
            >
              <div>
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Step 2</span>
                <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-600 transition-colors mt-0.5">
                  View My Bookings & Manage &rarr;
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Check your scheduled slots, cancellation options, and reservation status.
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                &rarr;
              </div>
            </Link>
          </div>

          {/* Technical Invariant Notice */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs font-bold text-emerald-700 uppercase tracking-wider mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>P20 Core Technical Invariant</span>
              </div>
              <h4 className="text-sm font-bold text-slate-900">PostgreSQL Range Exclusion Conflict Enforcement</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                Concurrent booking overlap protection is enforced at the database layer via <code className="text-indigo-600 bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">btree_gist</code> extension on <code className="text-indigo-600 bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">&quot;bookings_bookingslot&quot;</code> table. Overlapping attempts are rejected with <code className="text-emerald-700 bg-emerald-50 px-1 py-0.5 rounded font-mono text-[11px]">HTTP 409 Conflict</code>.
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block text-xs font-mono font-semibold text-emerald-800 bg-emerald-100/70 border border-emerald-300 px-3 py-1.5 rounded-lg">
                EXCLUDE USING gist
              </span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

