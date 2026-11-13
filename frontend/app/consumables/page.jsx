'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import LoadingState from '@/components/LoadingState';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import ConfirmModal from '@/components/ConfirmModal';
import { api } from '@/lib/api';

export default function ConsumablesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [consumables, setConsumables] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [resourceFilter, setResourceFilter] = useState('all');

  // Add / Edit Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formStock, setFormStock] = useState('10');
  const [formReorder, setFormReorder] = useState('5');
  const [formResource, setFormResource] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Adjust Stock Modal State
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [adjustDelta, setAdjustDelta] = useState('0');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState(null);

  // Delete Confirmation State
  const [deletingItem, setDeletingItem] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const canManage = user && (
    ['custodian', 'facility_mgr', 'admin'].includes(user.role) || user.is_superuser
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (lowStockOnly) params.low_stock = 'true';
      if (search.trim()) params.search = search.trim();
      if (resourceFilter !== 'all') params.resource = resourceFilter;

      const [items, resList] = await Promise.all([
        api.consumables.list(params),
        api.resources.list().catch(() => []),
      ]);
      setConsumables(Array.isArray(items) ? items : items.results || []);
      setResources(Array.isArray(resList) ? resList : resList.results || []);
    } catch (err) {
      setError(err.message || 'Failed to load consumables.');
    } finally {
      setLoading(false);
    }
  }, [lowStockOnly, search, resourceFilter]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      loadData();
    }
  }, [user, authLoading, router, loadData]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormName('');
    setFormUnit('pcs');
    setFormStock('10');
    setFormReorder('5');
    setFormResource('');
    setModalError(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormUnit(item.unit);
    setFormStock(String(item.stock));
    setFormReorder(String(item.reorder_level));
    setFormResource(item.resource ? String(item.resource) : '');
    setModalError(null);
    setShowModal(true);
  };

  const handleSaveConsumable = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      setModalError('Consumable name is required.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    const payload = {
      name: formName.trim(),
      unit: formUnit.trim() || 'pcs',
      stock: parseInt(formStock, 10) || 0,
      reorder_level: parseInt(formReorder, 10) || 0,
      resource: formResource ? parseInt(formResource, 10) : null,
    };

    try {
      if (editingItem) {
        await api.consumables.update(editingItem.id, payload);
        setActionSuccess(`Updated '${payload.name}' successfully.`);
      } else {
        await api.consumables.create(payload);
        setActionSuccess(`Created '${payload.name}' successfully.`);
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setModalError(err.message || 'Failed to save consumable.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const openAdjustModal = (item) => {
    setAdjustingItem(item);
    setAdjustDelta('5');
    setAdjustError(null);
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta) || delta === 0) {
      setAdjustError('Please specify a non-zero adjustment.');
      return;
    }

    setAdjustSubmitting(true);
    setAdjustError(null);

    try {
      await api.consumables.adjustStock(adjustingItem.id, { adjustment: delta });
      setActionSuccess(`Adjusted stock for '${adjustingItem.name}' by ${delta > 0 ? `+${delta}` : delta} ${adjustingItem.unit}.`);
      setAdjustingItem(null);
      loadData();
    } catch (err) {
      setAdjustError(err.message || 'Failed to adjust stock.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    setDeleteLoading(true);
    try {
      await api.consumables.delete(deletingItem.id);
      setActionSuccess(`Deleted consumable '${deletingItem.name}'.`);
      setDeletingItem(null);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to delete consumable.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Metrics
  const totalItems = consumables.length;
  const lowStockCount = consumables.filter(c => c.is_low_stock).length;
  const totalUnits = consumables.reduce((acc, c) => acc + (c.stock || 0), 0);

  return (
    <div className="min-h-screen bg-[#F5F5F5] flex flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
          {/* Top Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#111111] p-6 rounded-2xl text-white shadow-sm border border-[#222222]">
            <div>
              <div className="flex items-center space-x-2 text-[#F58220] text-xs font-semibold uppercase tracking-wider mb-1">
                <span>Inventory & Lab Supplies</span>
                <span>•</span>
                <span>Module M8</span>
              </div>
              <h1 className="text-2xl font-bold">Consumables & Equipment Stock</h1>
              <p className="text-neutral-300 text-xs mt-1 max-w-xl">
                Track lab materials, 3D printing filaments, electronic components, and accessories reserved during booking workflows.
              </p>
            </div>
            {canManage && (
              <button
                onClick={openCreateModal}
                className="inline-flex items-center justify-center space-x-2 bg-[#F58220] hover:bg-[#D96A0B] text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-[#F58220]/50"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                <span>Add Consumable</span>
              </button>
            )}
          </div>

          {/* Action Success Alert */}
          {actionSuccess && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span>✅</span>
                <span className="font-semibold">{actionSuccess}</span>
              </div>
              <button onClick={() => setActionSuccess(null)} className="text-emerald-600 hover:text-emerald-900 font-bold">×</button>
            </div>
          )}

          {/* Metrics Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs text-[#6B6B6B] font-medium">Catalogued Items</p>
                <p className="text-2xl font-black text-[#111111] mt-1">{totalItems}</p>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">Unique inventory types</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#FFF3E6] text-[#F58220] flex items-center justify-center text-lg font-bold border border-[#F58220]/20">
                📦
              </div>
            </div>

            <div className={`bg-white p-5 rounded-2xl border shadow-2xs flex items-center justify-between ${lowStockCount > 0 ? 'border-amber-300 bg-amber-50/20' : 'border-[#E5E5E5]'}`}>
              <div>
                <p className="text-xs text-[#6B6B6B] font-medium">Low Stock Alerts</p>
                <p className={`text-2xl font-black mt-1 ${lowStockCount > 0 ? 'text-amber-700' : 'text-[#111111]'}`}>{lowStockCount}</p>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">At or below reorder level</p>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${lowStockCount > 0 ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-[#F5F5F5] text-[#6B6B6B]'}`}>
                ⚠️
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#E5E5E5] shadow-2xs flex items-center justify-between">
              <div>
                <p className="text-xs text-[#6B6B6B] font-medium">Total Quantity In Stock</p>
                <p className="text-2xl font-black text-[#111111] mt-1">{totalUnits}</p>
                <p className="text-[11px] text-[#6B6B6B] mt-0.5">Available across all labs</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-lg font-bold border border-emerald-200">
                📊
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-[#E5E5E5] shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search consumables by name..."
                className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#F58220] focus:bg-white text-[#111111]"
              />
              <svg className="w-4 h-4 text-[#6B6B6B] absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={resourceFilter}
                onChange={(e) => setResourceFilter(e.target.value)}
                className="bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs text-[#111111] focus:outline-none focus:ring-2 focus:ring-[#F58220]"
              >
                <option value="all">All Resources / General</option>
                <option value="general">General Campus Inventory Only</option>
                {resources.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setLowStockOnly(!lowStockOnly)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center space-x-1.5 ${
                  lowStockOnly
                    ? 'bg-amber-100 border-amber-300 text-amber-900 shadow-2xs'
                    : 'bg-[#F5F5F5] border-[#E5E5E5] text-[#6B6B6B] hover:bg-[#E5E5E5]'
                }`}
              >
                <span>⚠️</span>
                <span>Low Stock Only</span>
              </button>
            </div>
          </div>

          {/* Consumables Inventory Grid/Table */}
          {loading ? (
            <LoadingState message="Loading consumables inventory..." />
          ) : error ? (
            <ErrorState message={error} onRetry={loadData} />
          ) : consumables.length === 0 ? (
            <EmptyState
              title="No Consumables Found"
              description="No inventory items match your current filter parameters."
              actionLabel={canManage ? "Add Consumable" : undefined}
              onAction={canManage ? openCreateModal : undefined}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-[#E5E5E5] shadow-2xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[#6B6B6B]">
                  <thead className="bg-[#F5F5F5] text-[#111111] uppercase tracking-wider text-[10px] font-bold border-b border-[#E5E5E5]">
                    <tr>
                      <th className="py-3 px-4">Item Name</th>
                      <th className="py-3 px-4">Associated Resource</th>
                      <th className="py-3 px-4">Unit</th>
                      <th className="py-3 px-4">Stock Level</th>
                      <th className="py-3 px-4">Reorder Level</th>
                      <th className="py-3 px-4">Status</th>
                      {canManage && <th className="py-3 px-4 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E5E5]">
                    {consumables.map((item) => (
                      <tr key={item.id} className="hover:bg-[#F5F5F5]/70 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-[#111111]">
                          {item.name}
                        </td>
                        <td className="py-3.5 px-4 text-[#6B6B6B]">
                          {item.resource_name ? (
                            <span className="inline-flex items-center space-x-1 bg-[#FFF3E6] text-[#D96A0B] px-2 py-0.5 rounded-md text-[11px] font-medium border border-[#F58220]/30">
                              <span>📍</span>
                              <span>{item.resource_name}</span>
                            </span>
                          ) : (
                            <span className="text-[#6B6B6B] italic">General Campus Inventory</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-[#6B6B6B] font-mono text-[11px]">
                          {item.unit}
                        </td>
                        <td className="py-3.5 px-4 font-black text-sm text-[#111111]">
                          {item.stock}
                        </td>
                        <td className="py-3.5 px-4 text-[#6B6B6B]">
                          ≤ {item.reorder_level} {item.unit}
                        </td>
                        <td className="py-3.5 px-4">
                          {item.is_low_stock ? (
                            <span className="inline-flex items-center space-x-1 bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full text-[10px] border border-red-200">
                              <span>⚠️</span>
                              <span>Low Stock</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full text-[10px] border border-emerald-200">
                              <span>✓</span>
                              <span>Healthy</span>
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                            <button
                              onClick={() => openAdjustModal(item)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-[#FFF3E6] text-[#D96A0B] hover:bg-[#F58220] hover:text-white rounded-lg transition-colors border border-[#F58220]/30 cursor-pointer"
                              title="Quick Stock Adjustment"
                            >
                              ± Adjust
                            </button>
                            <button
                              onClick={() => openEditModal(item)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-white text-[#111111] hover:bg-[#F5F5F5] rounded-lg transition-colors border border-[#111111] cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletingItem(item)}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200 cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add / Edit Consumable Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111111]/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E5E5E5] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <h3 className="font-bold text-[#111111] text-base">
                {editingItem ? 'Edit Consumable' : 'Add New Consumable'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-[#6B6B6B] hover:text-[#111111] text-lg font-bold">×</button>
            </div>

            {modalError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveConsumable} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[#111111] font-semibold mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. 3D Printer PLA Filament, Dry Erase Markers"
                  className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#F58220] focus:bg-white text-[#111111]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#111111] font-semibold mb-1">Measurement Unit</label>
                  <input
                    type="text"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    placeholder="pcs, spool, pack, roll"
                    className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#F58220] focus:bg-white text-[#111111]"
                  />
                </div>
                <div>
                  <label className="block text-[#111111] font-semibold mb-1">Initial Stock Quantity</label>
                  <input
                    type="number"
                    min="0"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#F58220] focus:bg-white text-[#111111]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#111111] font-semibold mb-1">Reorder Threshold</label>
                  <input
                    type="number"
                    min="0"
                    value={formReorder}
                    onChange={(e) => setFormReorder(e.target.value)}
                    className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-[#F58220] focus:bg-white text-[#111111]"
                  />
                </div>
                <div>
                  <label className="block text-[#111111] font-semibold mb-1">Associated Resource</label>
                  <select
                    value={formResource}
                    onChange={(e) => setFormResource(e.target.value)}
                    className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-2 py-2 text-xs focus:ring-2 focus:ring-[#F58220] focus:bg-white text-[#111111]"
                  >
                    <option value="">General (Campus-wide)</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-[#E5E5E5]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-white hover:bg-[#F5F5F5] text-[#111111] border border-[#111111] font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-[#F58220] hover:bg-[#D96A0B] text-white font-semibold rounded-xl text-xs shadow-md disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#F58220]/50"
                >
                  {modalSubmitting ? 'Saving...' : editingItem ? 'Update Consumable' : 'Create Consumable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Adjust Stock Modal */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#111111]/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#E5E5E5] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E5]">
              <h3 className="font-bold text-[#111111] text-base">
                Adjust Stock: {adjustingItem.name}
              </h3>
              <button onClick={() => setAdjustingItem(null)} className="text-[#6B6B6B] hover:text-[#111111] text-lg font-bold">×</button>
            </div>

            <p className="text-xs text-[#6B6B6B]">
              Current Available Stock: <strong className="text-[#111111] text-sm">{adjustingItem.stock} {adjustingItem.unit}</strong>
            </p>

            {adjustError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
                {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustStock} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#111111] font-semibold mb-1">
                  Stock Adjustment (+ to add, - to deduct)
                </label>
                <input
                  type="number"
                  required
                  value={adjustDelta}
                  onChange={(e) => setAdjustDelta(e.target.value)}
                  className="w-full bg-[#F5F5F5] border border-[#E5E5E5] rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-[#F58220] focus:bg-white text-[#111111]"
                />
                <p className="text-[11px] text-[#6B6B6B] mt-1">
                  Resulting Stock: <strong className="text-[#111111]">{adjustingItem.stock + (parseInt(adjustDelta, 10) || 0)} {adjustingItem.unit}</strong>
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#E5E5E5]">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="px-4 py-2 bg-white hover:bg-[#F5F5F5] text-[#111111] border border-[#111111] font-semibold rounded-xl text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustSubmitting}
                  className="px-4 py-2 bg-[#F58220] hover:bg-[#D96A0B] text-white font-semibold rounded-xl text-xs shadow-md disabled:opacity-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#F58220]/50"
                >
                  {adjustSubmitting ? 'Adjusting...' : 'Save Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <ConfirmModal
          isOpen={true}
          title="Delete Consumable Item"
          message={`Are you sure you want to delete '${deletingItem.name}'? This will remove the consumable from future booking selections.`}
          confirmText="Yes, Delete"
          cancelText="Cancel"
          confirmVariant="danger"
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeletingItem(null)}
        />
      )}
    </div>
  );
}
