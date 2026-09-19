'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login, register, error, setError } = useAuth();
  const router = useRouter();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('student');
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
        await register({ username, password, email, role, department });
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
    const demoEmail = `${demoUsername}@campus.edu`;

    try {
      // Try logging in first
      await login(demoUsername, demoPassword);
      router.push('/dashboard');
    } catch (loginErr) {
      // If demo user does not exist yet, register demo user automatically
      try {
        await register({
          username: demoUsername,
          password: demoPassword,
          email: demoEmail,
          role: demoRoleCode,
          department: 'Campus Administration',
          first_name: 'Demo',
          last_name: demoRoleCode.toUpperCase(),
        });
        router.push('/dashboard');
      } catch (regErr) {
        // If registration fails, notify user
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white font-extrabold text-2xl mx-auto shadow-lg shadow-indigo-500/30">
          P20
        </div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-white">
          Unified Campus Booking Platform
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Sign in to access campus resources, laboratories & facilities
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-slate-800/90 py-8 px-6 shadow-2xl rounded-2xl border border-slate-700/60 backdrop-blur-xl">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-medium">
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-medium text-slate-300">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="mt-1 block w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                id="username-input"
              />
            </div>

            {isRegisterMode && (
              <div>
                <label className="block text-xs font-medium text-slate-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@university.edu"
                  className="mt-1 block w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  id="email-input"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 block w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                id="password-input"
              />
            </div>

            {isRegisterMode && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Application Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    id="role-select"
                  >
                    {roles.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Department</label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="e.g. Computer Science"
                    className="mt-1 block w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    id="dept-input"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-md transition-all"
              id="submit-auth-btn"
            >
              {submitting ? 'Authenticating...' : isRegisterMode ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => setIsRegisterMode(!isRegisterMode)}
              className="text-xs text-indigo-400 hover:text-indigo-300 underline"
            >
              {isRegisterMode ? 'Already have an account? Sign in' : 'Need an account? Register new user'}
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-700/60">
            <div className="text-xs font-semibold text-slate-400 mb-3 text-center uppercase tracking-wider">
              Quick Role Presets (Click to Test)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {roles.map((r) => (
                <button
                  key={r.code}
                  onClick={() => handleDemoLogin(r.code)}
                  disabled={submitting}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 hover:border-indigo-500/50 rounded-lg text-[11px] font-medium text-left flex items-center justify-between transition-all"
                  id={`demo-btn-${r.code}`}
                >
                  <span className="truncate">{r.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Demo</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
