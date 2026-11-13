'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { user, loading, login, register, error, setError } = useAuth();
  const router = useRouter();
  const [logoError, setLogoError] = useState(false);

  React.useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [submitting, setSubmitting] = useState(false);

  const roles = [
    { code: 'student', label: 'Student' },
    { code: 'faculty', label: 'Faculty / Staff' },
    { code: 'custodian', label: 'Resource Custodian' },
    { code: 'dept_head', label: 'Department Head' },
    { code: 'facility_mgr', label: 'Facility Manager' },
    { code: 'admin', label: 'Administrator' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (isRegisterMode) {
        await register({ username, password, email, department });
      } else {
        await login(username, password);
      }
      router.push('/dashboard');
    } catch (err) {
      // Error handled by AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async (demoRoleCode) => {
    setSubmitting(true);
    setError(null);

    const demoUsername = `demo_${demoRoleCode}`;
    const demoPassword = `DemoPass123!`;

    try {
      await login(demoUsername, demoPassword);
      router.push('/dashboard');
    } catch (loginErr) {
      setError(`Demo account for '${demoRoleCode}' not found. Please run 'python backend/manage.py seed_demo_users' to initialize credentials.`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* Brand Logo with fallback */}
        <div className="mx-auto flex justify-center mb-3">
          {!logoError ? (
            <div className="relative w-16 h-16 flex items-center justify-center">
              <Image
                src="/logo.png"
                alt="LPU Logo"
                width={64}
                height={64}
                className="object-contain"
                onError={() => setLogoError(true)}
                priority
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-[#F58220] flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-orange-500/30 tracking-wider">
              LPU
            </div>
          )}
        </div>

        <h2 className="text-2xl font-black tracking-tight text-white">
          Lovely Professional University
        </h2>
        <p className="mt-1 text-xs font-semibold text-[#F58220] tracking-wider uppercase">
          Campus Resource, Lab & Facility Booking
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white text-[#111111] py-8 px-6 shadow-2xl rounded-2xl border border-[#E5E5E5]">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 text-xs font-semibold">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="mt-1 block w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] focus:bg-white transition-all"
                id="username-input"
              />
            </div>

            {isRegisterMode && (
              <div>
                <label className="block text-xs font-semibold text-[#111111] mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@lpu.co.in"
                  className="mt-1 block w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] focus:bg-white transition-all"
                  id="email-input"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-[#111111] mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] focus:bg-white transition-all"
                id="password-input"
              />
            </div>

            {isRegisterMode && (
              <>
                <div className="p-2.5 rounded-lg bg-[#FFF3E6] border border-[#F58220]/30 text-[#D96A0B] text-xs font-medium">
                  New accounts are created with the <strong>Student</strong> role by default. (Staff & faculty permissions are provisioned by administrators).
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#111111] mb-1">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Computer Science"
                    className="mt-1 block w-full px-3 py-2 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg text-sm text-[#111111] placeholder-[#6B6B6B] focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:bg-white transition-all"
                    id="dept-input"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#F58220] hover:bg-[#D96A0B] disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:ring-offset-2"
              id="submit-auth-btn"
            >
              {submitting ? 'Authenticating...' : isRegisterMode ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setIsRegisterMode(!isRegisterMode)}
              className="text-xs text-[#F58220] hover:text-[#D96A0B] font-semibold underline cursor-pointer"
            >
              {isRegisterMode ? 'Already have an account? Sign in' : 'Need an account? Register new user'}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-[#E5E5E5]">
            <div className="text-xs font-bold text-[#6B6B6B] mb-3 text-center uppercase tracking-wider">
              Quick Role Presets (Click to Test)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <button
                  key={r.code}
                  onClick={() => handleDemoLogin(r.code)}
                  disabled={submitting}
                  className="px-2.5 py-1.5 bg-[#F5F5F5] hover:bg-[#FFF3E6] text-[#111111] hover:text-[#D96A0B] border border-[#E5E5E5] hover:border-[#F58220] rounded-lg text-[11px] font-medium text-left flex items-center justify-between transition-all"
                  id={`demo-btn-${r.code}`}
                >
                  <span className="truncate">{r.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white text-[#6B6B6B] border border-[#E5E5E5] font-mono">Demo</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
