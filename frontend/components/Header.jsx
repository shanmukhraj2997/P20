'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();

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

  return (
    <header className="h-16 border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-30 px-6 flex items-center justify-between shadow-sm">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
          P20
        </div>
        <div>
          <h1 className="font-semibold text-gray-900 text-base leading-tight">Unified Campus Platform</h1>
          <p className="text-xs text-gray-500">Resource, Lab & Facility Booking</p>
        </div>
      </div>

      {user && (
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-medium flex items-center justify-center text-sm uppercase">
              {user.username ? user.username[0] : 'U'}
            </div>
            <div className="text-left hidden sm:block">
              <div className="text-xs font-semibold text-gray-800">{user.username}</div>
              <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold border ${getRoleBadgeColor(user.role)}`}>
                {user.role_display || user.role}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors border border-red-200"
            id="logout-btn"
          >
            Logout
          </button>
        </div>
      )}
    </header>
  );
}
