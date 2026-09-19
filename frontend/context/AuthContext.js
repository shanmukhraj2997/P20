'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('p20_auth_token');
    if (savedToken) {
      setToken(savedToken);
      api.me()
        .then((userData) => {
          setUser(userData);
          setLoading(false);
        })
        .catch(() => {
          localStorage.removeItem('p20_auth_token');
          setToken(null);
          setUser(null);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    setError(null);
    try {
      const res = await api.login({ username, password });
      localStorage.setItem('p20_auth_token', res.token);
      setToken(res.token);
      setUser(res.user);
      return res.user;
    } catch (err) {
      setError(err.message || 'Login failed.');
      throw err;
    }
  };

  const register = async (userData) => {
    setError(null);
    try {
      const res = await api.register(userData);
      localStorage.setItem('p20_auth_token', res.token);
      setToken(res.token);
      setUser(res.user);
      return res.user;
    } catch (err) {
      setError(err.message || 'Registration failed.');
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      // Ignore logout API error
    } finally {
      localStorage.removeItem('p20_auth_token');
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, error, login, register, logout, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
