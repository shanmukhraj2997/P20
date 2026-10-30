'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Sidebar() {
  const { user } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const role = user.role;

  const isActive = (href) => {
    if (href === '#') return false;
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', roles: ['student', 'faculty', 'custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Resource Catalogue', href: '/resources', badge: 'Live', roles: ['student', 'faculty', 'custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'My Bookings', href: '/my-bookings', badge: 'Live', roles: ['student', 'faculty', 'custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Timetable Integration', href: '#', badge: 'Sprint 4', roles: ['student', 'faculty', 'dept_head', 'admin'] },
    { name: 'Approval Workflows', href: '#', badge: 'Sprint 5', roles: ['custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Check-in & Auto-Release', href: '#', badge: 'Sprint 6', roles: ['custodian', 'facility_mgr', 'admin'] },
    { name: 'Maintenance & Downtime', href: '#', badge: 'Sprint 7', roles: ['custodian', 'facility_mgr', 'admin'] },
    { name: 'Consumables & Accessories', href: '#', badge: 'Sprint 8', roles: ['custodian', 'facility_mgr', 'admin'] },
    { name: 'Analytics & Reporting', href: '#', badge: 'Sprint 9', roles: ['dept_head', 'facility_mgr', 'admin'] },
  ];

  const allowedNav = navigation.filter(item => item.roles.includes(role));

  return (
    <aside className="hidden md:flex w-64 bg-slate-900 text-slate-300 min-h-[calc(100vh-4rem)] p-4 flex-col justify-between shadow-xl shrink-0">
      <div>
        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Platform Navigation
        </div>
        <nav className="space-y-1">
          {allowedNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive(item.href)
                  ? 'bg-indigo-600 text-white shadow-md font-semibold'
                  : item.href !== '#'
                  ? 'text-slate-200 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-300'
              }`}
            >
              <span>{item.name}</span>
              {item.badge && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  isActive(item.href)
                    ? 'bg-indigo-700/60 text-white border-indigo-400/40'
                    : item.href !== '#'
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      <div className="p-3.5 bg-slate-800/90 rounded-xl border border-slate-700/60 text-xs">
        <div className="flex items-center space-x-2 font-semibold text-white mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>P20 Core Engine Active</span>
        </div>
        <div className="text-[11px] text-slate-300">PostgreSQL Conflict Enforcement</div>
        <div className="mt-2 text-[10px] text-indigo-400 font-mono">Sprint 1 Verified</div>
      </div>
    </aside>
  );
}

