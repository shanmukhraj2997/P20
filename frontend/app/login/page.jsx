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
  const [selectedRole, setSelectedRole] = useState('');
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

  const handleRoleChange = (roleCode) => {
    setSelectedRole(roleCode);
    if (!roleCode) return;
    setUsername(roleCode);
    setPassword('DemoPass123!');
  };

  const handleRoleLogin = async (roleCode) => {
    const targetRole = roleCode || selectedRole;
    if (!targetRole) return;
    setSubmitting(true);
    setError(null);

    try {
      await login(targetRole, 'DemoPass123!');
      router.push('/dashboard');
    } catch (cleanErr) {
      try {
        await login(`demo_${targetRole}`, 'DemoPass123!');
        router.push('/dashboard');
      } catch (fallbackErr) {
        const roleLabel = roles.find((r) => r.code === targetRole)?.label || targetRole;
        setError(`Unable to sign in as ${roleLabel}. Please check credentials or network connection.`);
      }
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

          {/* Role Dropdown Selection */}
          {!isRegisterMode && (
            <div className="mt-6 pt-6 border-t border-[#E5E5E5]">
              <label
                htmlFor="role-select"
                className="block text-xs font-bold text-[#6B6B6B] mb-2 uppercase tracking-wider text-center"
              >
                Select Role
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    id="role-select"
                    value={selectedRole}
                    onChange={(e) => handleRoleChange(e.target.value)}
                    disabled={submitting}
                    className="w-full px-3 py-2.5 bg-[#F5F5F5] border border-[#E5E5E5] rounded-lg text-sm text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:border-[#F58220] focus:bg-white transition-all appearance-none cursor-pointer pr-8 font-medium"
                  >
                    <option value="">-- Choose Role --</option>
                    {roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-[#6B6B6B]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRoleLogin(selectedRole)}
                  disabled={!selectedRole || submitting}
                  className="px-4 py-2.5 bg-[#F58220] hover:bg-[#D96A0B] text-white text-xs font-bold rounded-lg shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                  id="role-signin-btn"
                >
                  {submitting ? '...' : 'Sign In'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
