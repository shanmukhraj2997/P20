'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await api.notifications.list();
      setNotifications(data.results || []);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      // ignore silently
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleMarkRead = async (id) => {
    try {
      await api.notifications.markRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      // ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {
      // ignore
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'admin': return 'bg-white/10 text-[#F58220] border-[#F58220]/40';
      case 'facility_mgr': return 'bg-white/10 text-white border-white/20';
      case 'dept_head': return 'bg-amber-950/60 text-amber-300 border-amber-800/60';
      case 'custodian': return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60';
      case 'faculty': return 'bg-white/10 text-white/90 border-white/20';
      default: return 'bg-white/10 text-white/80 border-white/20';
    }
  };

  const mobileNav = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Resource Catalogue', href: '/resources' },
    { name: 'My Bookings', href: '/my-bookings' },
  ];

  return (
    <>
      <header className="h-16 border-b border-[#222222] bg-[#111111] sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between shadow-xs text-white">
        <div className="flex items-center space-x-3">
          {/* Mobile hamburger toggle */}
          {user && (
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 focus:outline-none"
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
            <div className="w-9 h-9 rounded-xl bg-[#F58220] flex items-center justify-center text-white font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
              P20
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-white text-sm leading-tight">Campus Resource Portal</span>
                <span className="hidden sm:inline-block text-[10px] bg-[#F58220]/20 text-[#F58220] font-bold px-1.5 py-0.5 rounded border border-[#F58220]/40">
                  LPU
                </span>
              </div>
              <p className="text-[11px] text-white/60 hidden sm:block">Lovely Professional University</p>
            </div>
          </Link>
        </div>

        {user && (
          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* Notification Bell Dropdown */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-none"
                aria-label="View notifications"
                id="notification-bell-btn"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#F58220] text-[9px] font-bold text-white shadow-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl border border-[#E5E5E5] z-50 overflow-hidden divide-y divide-[#E5E5E5] text-[#111111]">
                    <div className="px-4 py-3 bg-[#F5F5F5] flex items-center justify-between border-b border-[#E5E5E5]">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-[#111111] uppercase tracking-wider">Notifications</span>
                        {unreadCount > 0 && (
                          <span className="text-[10px] bg-[#FFF3E6] text-[#D96A0B] font-bold px-1.5 py-0.5 rounded-full border border-[#F58220]/30">
                            {unreadCount} unread
                          </span>
                        )}
                      </div>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-[11px] font-semibold text-[#F58220] hover:text-[#D96A0B] cursor-pointer"
                        >
                          Mark all as read
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-[#E5E5E5]">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-[#6B6B6B]">
                          No notifications yet.
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <div
                            key={n.id}
                            onClick={() => !n.read && handleMarkRead(n.id)}
                            className={`p-3.5 transition-colors cursor-pointer flex items-start space-x-3 ${n.read ? 'bg-white hover:bg-[#F5F5F5] opacity-75' : 'bg-[#FFF3E6]/60 hover:bg-[#FFF3E6] font-medium'}`}
                          >
                            <span className="text-base select-none mt-0.5">
                              {n.type === 'approval' ? '✅' :
                               n.type === 'rejection' ? '❌' :
                               n.type === 'cancellation' ? '🚫' :
                               n.type === 'no_show' ? '⚠️' :
                               n.type === 'maintenance_cancellation' ? '🛠️' :
                               n.type === 'reminder' ? '⏰' : '🔔'}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <p className="text-xs font-bold text-[#111111] truncate">{n.title || n.type_display}</p>
                                <span className="text-[10px] text-[#6B6B6B] whitespace-nowrap">
                                  {new Date(n.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <p className="text-xs text-[#6B6B6B] mt-0.5 line-clamp-2">{n.message}</p>
                            </div>
                            {!n.read && (
                              <span className="w-2 h-2 rounded-full bg-[#F58220] mt-1 shrink-0" />
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center space-x-2.5 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              <div className="w-7 h-7 rounded-full bg-[#F58220] text-white font-bold flex items-center justify-center text-xs uppercase shadow-2xs">
                {user.username ? user.username[0] : 'U'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-bold text-white leading-tight">{user.username}</div>
                <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold border ${getRoleBadgeColor(user.role)}`}>
                  {user.role_display || user.role}
                </span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg transition-colors border border-rose-800/40"
              id="logout-btn"
            >
              Logout
            </button>
          </div>
        )}
      </header>

      {/* Mobile Off-canvas Navigation Drawer */}
      {user && mobileMenuOpen && (
        <div className="md:hidden bg-[#111111] border-b border-[#222222] px-4 py-3 space-y-1 shadow-lg text-white">
          <div className="text-[10px] font-bold text-[#6B6B6B] uppercase tracking-wider px-2 py-1">Navigation</div>
          {mobileNav.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                pathname === item.href
                  ? 'bg-[#F58220] text-white font-bold'
                  : 'text-white/80 hover:bg-white/10'
              }`}
            >
              {item.name}
            </Link>
          ))}
          <div className="pt-2 border-t border-[#222222] text-[11px] text-white/70 px-2 flex items-center justify-between">
            <span>Signed in as <strong>{user.username}</strong></span>
            <span className="capitalize text-[#F58220] font-semibold">{user.role}</span>
          </div>
        </div>
      )}
    </>
  );
}
