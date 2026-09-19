'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import SearchBar from '@/components/SearchBar';
import FilterPanel from '@/components/FilterPanel';
import ResourceCard from '@/components/ResourceCard';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { api } from '@/lib/api';

export default function ResourceCataloguePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [resources, setResources] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter States
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [minCapacity, setMinCapacity] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Fetch Resource Types on Mount
  useEffect(() => {
    api.resourceTypes()
      .then((data) => setTypes(data))
      .catch(() => {});
  }, []);

  // Fetch Resources with Filters
  const fetchResources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.resources.list({
        search,
        resource_type: selectedType,
        status: selectedStatus,
        min_capacity: minCapacity,
      });
      setResources(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch resource catalogue.');
    } finally {
      setLoading(false);
    }
  }, [search, selectedType, selectedStatus, minCapacity]);

  useEffect(() => {
    if (user) {
      const timer = setTimeout(() => {
        fetchResources();
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [fetchResources, user]);

  const handleResetFilters = () => {
    setSearch('');
    setSelectedType('');
    setSelectedStatus('');
    setMinCapacity('');
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-6">
          {/* Page Banner */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs text-indigo-600 font-bold uppercase tracking-wider mb-1">
                <span>Module M1</span>
                <span>•</span>
                <span>Campus Infrastructure</span>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Resource Catalogue</h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xl">
                Browse classrooms, laboratories, specialized research equipment, seminar halls, meeting rooms, and sports facilities.
              </p>
            </div>

            <div className="flex items-center space-x-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="text-right">
                <div className="text-xs text-slate-500 font-medium">Matching Resources</div>
                <div className="text-xl font-extrabold text-indigo-600">{resources.length}</div>
              </div>
            </div>
          </div>

          {/* Search & Filter Section */}
          <div className="space-y-4">
            <SearchBar
              value={search}
              onChange={setSearch}
              onClear={() => setSearch('')}
              placeholder="Search by resource name, building location, or equipment tags..."
            />

            <FilterPanel
              types={types}
              selectedType={selectedType}
              onTypeChange={setSelectedType}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              minCapacity={minCapacity}
              onMinCapacityChange={setMinCapacity}
              onReset={handleResetFilters}
            />
          </div>

          {/* Catalogue Content State */}
          {loading ? (
            <LoadingState count={6} />
          ) : error ? (
            <ErrorState error={error} onRetry={fetchResources} />
          ) : resources.length === 0 ? (
            <EmptyState
              message={
                search || selectedType || selectedStatus || minCapacity
                  ? "No campus resources matched your search filter criteria."
                  : "No resources found in the campus database."
              }
              onReset={handleResetFilters}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {resources.map((res) => (
                <ResourceCard key={res.id} resource={res} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
