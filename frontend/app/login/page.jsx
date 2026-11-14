'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage() {
  const { user, loading, login, register, error, setError } = useAuth();
  const router = useRouter();
  const [logoError, setLogoError] = useState(false);

  React.useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // View modes: 'login' | 'register' | 'forgot' | 'reset'
  const [viewMode, setViewMode] = useState('login');

  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Computer Science');
  const [selectedRole, setSelectedRole] = useState('');
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);

  // Forgot / Reset password fields
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetTargetUsername, setResetTargetUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState(null);

  const [submitting, setSubmitting] = useState(false);

  const roles = [
    { code: 'student', label: 'Student' },
    { code: 'faculty', label: 'Faculty / Staff' },
    { code: 'custodian', label: 'Resource Custodian' },
    { code: 'dept_head', label: 'Department Head' },
    { code: 'facility_mgr', label: 'Facility Manager' },
    { code: 'admin', label: 'Administrator' },
  ];

  const handleRoleSelect = (roleCode) => {
    setSelectedRole(roleCode);
    if (!roleCode) return;
    setUsername(roleCode);
    setPassword('DemoPass123!');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (viewMode === 'register') {
        await register({ username, password, email, department });
        router.push('/dashboard');
      } else if (viewMode === 'login') {
        try {
          await login(username, password);
          router.push('/dashboard');
        } catch (loginErr) {
          // If user logged in as role (e.g. 'admin'), try demo_ fallback
          if (!username.startsWith('demo_')) {
            try {
              await login(`demo_${username}`, password);
              router.push('/dashboard');
              return;
            } catch (fallbackErr) {
              // Ignore and let main error stand
            }
          }
          throw loginErr;
        }
      } else if (viewMode === 'forgot') {
        const res = await api.forgotPassword({ email_or_username: resetIdentifier });
        setResetTargetUsername(res.username || resetIdentifier);
        setResetToken(res.reset_token || '');
        setSuccessMessage(res.message || 'Verification token generated. Please enter your new password.');
        setViewMode('reset');
      } else if (viewMode === 'reset') {
        if (newPassword !== confirmPassword) {
          setError('Passwords do not match.');
          setSubmitting(false);
          return;
        }
        const res = await api.resetPassword({
          username: resetTargetUsername,
          token: resetToken,
          new_password: newPassword,
        });
        setSuccessMessage(res.message || 'Password updated successfully! You can now log in.');
        setUsername(resetTargetUsername);
        setPassword(newPassword);
        setViewMode('login');
      }
    } catch (err) {
      setError(err.message || 'Operation failed. Please check your inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E24A68] via-[#D83B5E] to-[#B32448] flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      {/* Central Floating Card */}
      <div className="w-full max-w-4xl bg-white rounded-3xl md:rounded-[36px] shadow-2xl shadow-black/30 overflow-hidden flex flex-col md:flex-row relative min-h-[540px]">
        
        {/* Left Side: Curved Orange Hero Column */}
        <div className="relative md:w-5/12 bg-gradient-to-b from-[#FFA74D] via-[#FF8C37] to-[#F57C1F] text-white p-8 md:p-10 flex flex-col justify-between overflow-hidden z-10">
          {/* Circular convex curve bulging outward to the right on desktop */}
          <div className="hidden md:block absolute -right-24 top-1/2 -translate-y-1/2 w-48 h-[135%] bg-gradient-to-b from-[#FFA74D] via-[#FF8C37] to-[#F57C1F] rounded-r-full pointer-events-none" />

          {/* Top Brand Logo */}
          <div className="relative z-20 flex items-center gap-3">
            {!logoError ? (
              <div className="relative w-10 h-10 flex items-center justify-center bg-white/20 backdrop-blur-sm rounded-xl p-1 shadow-sm">
                <Image
                  src="/logo.png"
                  alt="LPU Logo"
                  width={36}
                  height={36}
                  className="object-contain"
                  onError={() => setLogoError(true)}
                  priority
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-white text-[#F58220] flex items-center justify-center font-black text-lg shadow-md">
                LPU
              </div>
            )}
            <span className="font-extrabold tracking-tight text-white text-base">
              LPU Portal
            </span>
          </div>

          {/* Center Welcome Headline */}
          <div className="relative z-20 my-auto py-8">
            <h1 className="text-2xl md:text-3xl font-extrabold leading-tight tracking-tight text-white drop-shadow-sm">
              Welcome to the <br />
              Campus Community!
            </h1>
            <p className="mt-3 text-xs text-white/90 leading-relaxed font-normal max-w-xs">
              Centralized platform for booking university labs, auditoriums, classrooms, sports arenas and advanced equipment.
            </p>
          </div>

          {/* Bottom Campus Badge */}
          <div className="relative z-20 text-[11px] font-medium text-white/80">
            Lovely Professional University &copy; {new Date().getFullYear()}
          </div>
        </div>

        {/* Right Side: Clean White Form Column */}
        <div className="relative md:w-7/12 bg-white p-8 md:p-12 flex flex-col justify-center z-20">
          
          {/* User Circular Avatar */}
          <div className="text-center mb-5">
            <div className="w-16 h-16 mx-auto mb-2 rounded-full bg-[#F1F5F9] flex items-center justify-center text-[#94A3B8] shadow-inner">
              {viewMode === 'forgot' || viewMode === 'reset' ? (
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              ) : (
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>
            <p className="text-xs text-[#6B7280] font-medium">
              {viewMode === 'login' && 'Login below to get started.'}
              {viewMode === 'register' && 'Register below to get started.'}
              {viewMode === 'forgot' && 'Enter your email or username to reset.'}
              {viewMode === 'reset' && 'Create your new password below.'}
            </p>
          </div>

          {/* Feedback Messages */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium text-center">
              {successMessage}
            </div>
          )}

          {/* Main Action Form */}
          <form className="space-y-3.5" onSubmit={handleSubmit}>

            {/* LOGIN & REGISTER: Username Input */}
            {(viewMode === 'login' || viewMode === 'register') && (
              <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username / Student ID"
                  className="w-full bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none ml-3"
                  id="username-input"
                />
              </div>
            )}

            {/* REGISTER: Email Address Input */}
            {viewMode === 'register' && (
              <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail Address"
                  className="w-full bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none ml-3"
                  id="email-input"
                />
              </div>
            )}

            {/* REGISTER: Department */}
            {viewMode === 'register' && (
              <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Department (e.g. Computer Science)"
                  className="w-full bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none ml-3"
                  id="dept-input"
                />
              </div>
            )}

            {/* LOGIN & REGISTER: Password Input */}
            {(viewMode === 'login' || viewMode === 'register') && (
              <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your Password"
                  className="w-full bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none ml-3"
                  id="password-input"
                />
              </div>
            )}

            {/* LOGIN: Clean Role Dropdown Selection */}
            {viewMode === 'login' && (
              <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <select
                  id="role-select"
                  value={selectedRole}
                  onChange={(e) => handleRoleSelect(e.target.value)}
                  className="w-full bg-transparent text-sm text-[#1E293B] focus:outline-none ml-3 cursor-pointer appearance-none font-medium"
                >
                  <option value="">Select Role...</option>
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-4 text-[#94A3B8]">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            )}

            {/* FORGOT PASSWORD: Email or Username */}
            {viewMode === 'forgot' && (
              <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <input
                  type="text"
                  required
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="Enter your E-mail or Username"
                  className="w-full bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none ml-3"
                  id="reset-identifier-input"
                />
              </div>
            )}

            {/* RESET PASSWORD: Token & New Password */}
            {viewMode === 'reset' && (
              <>
                <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                  <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <input
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Reset Verification Token"
                    className="w-full bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none ml-3 font-mono"
                    id="reset-token-input"
                  />
                </div>

                <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                  <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New Password (min 6 chars)"
                    className="w-full bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none ml-3"
                    id="new-password-input"
                  />
                </div>

                <div className="relative flex items-center rounded-full bg-[#F8FAFC] border border-[#E2E8F0] px-4 py-3 focus-within:border-[#F58220] focus-within:ring-2 focus-within:ring-[#F58220]/20 transition-all">
                  <svg className="w-4 h-4 text-[#94A3B8] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm New Password"
                    className="w-full bg-transparent text-sm text-[#1E293B] placeholder-[#94A3B8] focus:outline-none ml-3"
                    id="confirm-password-input"
                  />
                </div>
              </>
            )}

            {/* Checkbox and Forgot Password Row (In Login Mode) */}
            {viewMode === 'login' && (
              <div className="flex items-center justify-between text-xs text-[#94A3B8] px-1 pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={keepLoggedIn}
                    onChange={(e) => setKeepLoggedIn(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-[#CBD5E1] text-[#F58220] focus:ring-[#F58220] cursor-pointer"
                  />
                  <span>Keep me logged in</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setViewMode('forgot');
                  }}
                  className="hover:text-[#F58220] transition-colors font-medium cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>
            )}

            {/* Primary Action Button (Gradient Pill with Glow) */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-3.5 px-6 rounded-full font-bold text-white text-sm shadow-lg shadow-orange-500/35 bg-gradient-to-r from-[#FF7253] via-[#F58220] to-[#FFA048] hover:opacity-95 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              id="submit-auth-btn"
            >
              {submitting ? 'Please wait...' : (
                <>
                  {viewMode === 'login' && 'Login'}
                  {viewMode === 'register' && 'Register'}
                  {viewMode === 'forgot' && 'Send Reset Token'}
                  {viewMode === 'reset' && 'Update Password'}
                </>
              )}
            </button>
          </form>

          {/* Bottom Switch Links */}
          <div className="text-center text-xs text-[#64748B] mt-5">
            {viewMode === 'login' && (
              <p>
                New User?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setViewMode('register');
                  }}
                  className="font-semibold text-[#FF6565] hover:underline cursor-pointer"
                >
                  Register here.
                </button>
              </p>
            )}

            {viewMode === 'register' && (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setViewMode('login');
                  }}
                  className="font-semibold text-[#FF6565] hover:underline cursor-pointer"
                >
                  Login here.
                </button>
              </p>
            )}

            {(viewMode === 'forgot' || viewMode === 'reset') && (
              <p>
                Remembered your password?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setViewMode('login');
                  }}
                  className="font-semibold text-[#FF6565] hover:underline cursor-pointer"
                >
                  Back to Login.
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
