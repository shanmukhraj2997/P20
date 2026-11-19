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
    { name: 'Permission Slips', href: '/permission-slips', badge: 'Official', roles: ['student', 'faculty', 'custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Verify Slips', href: '/permission-slips/verify', badge: 'Admin', roles: ['dept_head', 'facility_mgr', 'admin'] },
    { name: 'Timetable Schedule', href: '/timetable', badge: 'Live', roles: ['student', 'faculty', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Approvals', href: '/approvals', badge: 'Queue', roles: ['custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Check-in / Check-out', href: '/check-in', badge: 'Desk', roles: ['custodian', 'dept_head', 'facility_mgr', 'admin'] },
    { name: 'Maintenance & Downtime', href: '/maintenance', badge: 'Live', roles: ['custodian', 'facility_mgr', 'admin'] },
    { name: 'Consumables & Stock', href: '/consumables', badge: 'Live', roles: ['custodian', 'facility_mgr', 'admin'] },
    { name: 'Analytics & Reporting', href: '/analytics', badge: 'Live', roles: ['custodian', 'dept_head', 'facility_mgr', 'admin'] },
  ];

  const allowedNav = navigation.filter(item => item.roles.includes(role));

  return (
    <aside className="hidden md:flex w-64 bg-[#111111] text-white min-h-[calc(100vh-4rem)] p-4 flex-col justify-between shadow-xl shrink-0 border-r border-[#222222]">
      <div>
        <div className="px-3 py-2 text-xs font-semibold text-[#6B6B6B] uppercase tracking-wider mb-2">
          Platform Navigation
        </div>
        <nav className="space-y-1">
          {allowedNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                isActive(item.href)
                  ? 'bg-[#F58220] text-white shadow-md font-semibold'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>{item.name}</span>
              {item.badge && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                  isActive(item.href)
                    ? 'bg-[#D96A0B] text-white border-white/20'
                    : 'bg-white/10 text-white/90 border-white/10'
                }`}>
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>

      <div className="p-3.5 bg-white/5 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center space-x-2 font-semibold text-white mb-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>P20 Core Engine Active</span>
        </div>
        <div className="text-[11px] text-white/70">PostgreSQL Conflict Enforcement</div>
        <div className="mt-2 text-[10px] text-[#F58220] font-mono">Sprint 1 Verified</div>
      </div>
    </aside>
  );
}
