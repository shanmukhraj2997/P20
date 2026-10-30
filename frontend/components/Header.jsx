'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'facility_mgr': return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'dept_head': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'custodian': return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'faculty': return 'bg-indigo-100 text-indigo-800 border-indigo-300';
      default: return 'bg-teal-100 text-teal-800 border-teal-300';
    }
  };

  const mobileNav = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Resource Catalogue', href: '/resources' },
    { name: 'My Bookings', href: '/my-bookings' },
  ];

  return (
    <>
      <header className="h-16 border-b border-gray-200 bg-white/90 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between shadow-2xs">
        <div className="flex items-center space-x-3">
          {/* Mobile hamburger toggle */}
          {user && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-none"
              aria-label="Toggle navigation menu"
              id="mobile-nav-toggle"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          )}

          <Link href="/dashboard" className="flex items-center space-x-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
              P20
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-slate-900 text-sm leading-tight">Campus Resource Portal</span>
                <span className="hidden sm:inline-block text-[10px] bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded border border-amber-200">
                  LPU
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">Lovely Professional University</p>
            </div>
          </Link>
        </div>

        {user && (
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="flex items-center space-x-2.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/80">
              <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-xs uppercase shadow-2xs">
                {user.username ? user.username[0] : 'U'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-slate-900 leading-tight">{user.username}</div>
                <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold border ${getRoleBadgeColor(user.role)}`}>
                  {user.role_display || user.role}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
              id="logout-btn"
            >
              Logout
            </button>
          </div>
        )}
      </header>

      {/* Mobile Off-canvas Navigation Drawer */}
      {user && mobileMenuOpen && (
        <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 space-y-1 shadow-lg">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">Navigation</div>
          {mobileNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                pathname === item.href
                  ? 'bg-indigo-600 text-white font-bold'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              {item.name}
            </Link>
          ))}
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-400 px-2 flex items-center justify-between">
            <span>Signed in as <strong>{user.username}</strong></span>
            <span className="capitalize text-indigo-400 font-semibold">{user.role}</span>
          </div>
        </div>
      )}
    </>
  );
}

