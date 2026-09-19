'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function Sidebar() {
  const { user } = useAuth();

  if (!user) return null;

  const role = user.role;

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', roles: ['student', 'faculty', 'custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Resource Catalogue (M1)', href: '/resources', badge: 'Active', roles: ['student', 'faculty', 'custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Availability & Rules (M2)', href: '#', badge: 'Sprint 2', roles: ['faculty', 'custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Booking Engine (M3)', href: '#', badge: 'Sprint 3', roles: ['student', 'faculty', 'custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Timetable Integration (M4)', href: '#', badge: 'Sprint 4', roles: ['student', 'faculty', 'dept_head', 'admin'] },
    { name: 'Approval Workflows (M5)', href: '#', badge: 'Sprint 5', roles: ['custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Check-in & Auto-Release (M6)', href: '#', badge: 'Sprint 6', roles: ['custodian', 'facility_mgr', 'admin'] },
    { name: 'Maintenance & Downtime (M7)', href: '#', badge: 'Sprint 7', roles: ['custodian', 'facility_mgr', 'admin'] },
    { name: 'Consumables & Accessories (M8)', href: '#', badge: 'Sprint 8', roles: ['custodian', 'facility_mgr', 'admin'] },
    { name: 'Analytics & Reporting (M9)', href: '#', badge: 'Sprint 9', roles: ['dept_head', 'facility_mgr', 'admin'] },
  ];

  const allowedNav = navigation.filter(item => item.roles.includes(role));

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 min-h-[calc(100vh-4rem)] p-4 flex flex-col justify-between shadow-xl">
      <div>
        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Platform Modules
        </div>
        <nav className="space-y-1">
          {allowedNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                item.href === '/resources' || item.href === '/dashboard'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>{item.name}</span>
              {item.badge && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/50 text-xs">
        <div className="font-semibold text-white mb-1">P20 System Active</div>
        <div className="text-[11px] text-slate-400">Database & DRF Backend Connected</div>
        <div className="mt-2 text-[10px] text-indigo-400 font-mono">Sprint 1 Foundation</div>
      </div>
    </aside>
  );
}
