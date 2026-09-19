'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [healthStatus, setHealthStatus] = useState({ status: 'checking...', ok: false });
  const [healthLoading, setHealthLoading] = useState(true);

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

  useEffect(() => {
    if (user) {
      checkHealth();
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

        <main className="flex-1 p-8">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl mb-8 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
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

          {/* Quick Metrics Shell */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Resource Catalogue</div>
              <div className="text-xl font-bold text-slate-900 mt-1">Sprint 2</div>
              <div className="text-[11px] text-indigo-600 font-medium mt-1">Module M1 Prepared</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">PostgreSQL Exclusion Rules</div>
              <div className="text-xl font-bold text-emerald-600 mt-1">btree_gist</div>
              <div className="text-[11px] text-slate-500 mt-1">PostgreSQL 18 Range Constraints</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Authentication State</div>
              <div className="text-xl font-bold text-indigo-600 mt-1">Token Auth</div>
              <div className="text-[11px] text-slate-500 mt-1">Backend Enforced</div>
            </div>
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Active User Role</div>
              <div className="text-xl font-bold text-purple-600 mt-1 capitalize">{user.role}</div>
              <div className="text-[11px] text-slate-500 mt-1">6 Role System Active</div>
            </div>
          </div>

          {/* Future Modules Overview Grid */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Architecture Roadmap & Module Shells</h3>
            <p className="text-xs text-slate-500 mb-4">Functional modules ready for incremental sprint delivery.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">M1 — Resource Catalogue</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-semibold">Sprint 2</span>
                </div>
                <p className="text-xs text-slate-500">Classrooms, Computer Labs, Special Equipment, Vehicles, Sports Facilities.</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">M2 — Availability & Rules</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-semibold">Sprint 2</span>
                </div>
                <p className="text-xs text-slate-500">Operating hours, lead times, role max durations, quota limits.</p>
              </div>

              <div className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-800">M3 — Booking Engine</span>
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-semibold">Sprint 3</span>
                </div>
                <p className="text-xs text-slate-500">Conflict-safe bookings using PostgreSQL range exclusion constraints.</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
