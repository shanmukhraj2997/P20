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
import ResourceFormModal from '@/components/ResourceFormModal';
import { api } from '@/lib/api';

export default function ResourceCataloguePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [resources, setResources] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Filter States
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [minCapacity, setMinCapacity] = useState('');

  // Custodian/Admin Modal State
  const [showAddModal, setShowAddModal] = useState(false);

  const isStaffRole = user && (['custodian', 'facility_mgr', 'admin'].includes(user.role) || user.is_superuser);

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
      <div className="min-h-screen bg-[#111111] flex items-center justify-center text-[#6B6B6B] text-sm">
        Authenticating session...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-8 space-y-6">
          {/* Page Banner */}
          <div className="bg-white p-6 rounded-2xl border border-[#E5E5E5] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2 text-xs text-[#F58220] font-bold uppercase tracking-wider mb-1">
                <span>Module M1</span>
                <span>•</span>
                <span>Campus Infrastructure & Facilities</span>
              </div>
              <h2 className="text-2xl font-bold text-[#111111]">Resource Catalogue</h2>
              <p className="text-xs text-[#6B6B6B] mt-1 max-w-xl">
                Browse classrooms, laboratories, specialized research equipment, seminar halls, meeting rooms, and sports facilities.
              </p>
            </div>

            <div className="flex items-center space-x-3">
              <div className="bg-[#F5F5F5] px-4 py-2.5 rounded-xl border border-[#E5E5E5] text-right">
                <div className="text-[11px] text-[#6B6B6B] font-medium">Matching Resources</div>
                <div className="text-lg font-black text-[#F58220]">{resources.length}</div>
              </div>

              {isStaffRole && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-3 bg-[#F58220] hover:bg-[#D96A0B] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-1.5 shrink-0 focus:ring-2 focus:ring-[#F58220] cursor-pointer"
                  id="add-resource-modal-btn"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Add Resource</span>
                </button>
              )}
            </div>
          </div>

          {toastMsg && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold shadow-2xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>{toastMsg}</span>
              </div>
              <button onClick={() => setToastMsg(null)} className="text-emerald-700 hover:text-emerald-900 text-xs font-bold cursor-pointer">Dismiss</button>
            </div>
          )}

          {/* Quick Category Filter Pills */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setSelectedType('')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                selectedType === ''
                  ? 'bg-[#F58220] text-white border-[#F58220] shadow-xs'
                  : 'bg-white text-[#111111] border-[#E5E5E5] hover:bg-[#F5F5F5]'
              }`}
            >
              All Categories
            </button>
            {types.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedType(String(t.id))}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                  String(selectedType) === String(t.id)
                    ? 'bg-[#F58220] text-white border-[#F58220] shadow-xs'
                    : 'bg-white text-[#111111] border-[#E5E5E5] hover:bg-[#F5F5F5]'
                }`}
              >
                {t.name}
              </button>
            ))}
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

          {/* Custodian Add Resource Modal */}
          <ResourceFormModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onSuccess={(newRes) => {
              setToastMsg(`Resource "${newRes.name}" created successfully!`);
              fetchResources();
              setTimeout(() => setToastMsg(null), 4000);
            }}
            types={types}
          />
        </main>
      </div>
    </div>
  );
}
