'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function ResourceFormModal({
  isOpen,
  onClose,
  onSuccess,
  resource = null, // If passed, edit mode; else create mode
  types = []
}) {
  const isEditMode = Boolean(resource && resource.id);

  const [name, setName] = useState('');
  const [resourceTypeId, setResourceTypeId] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState(30);
  const [description, setDescription] = useState('');
  const [featuresStr, setFeaturesStr] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [statusVal, setStatusVal] = useState('available');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (resource) {
      setName(resource.name || '');
      setResourceTypeId(resource.resource_type || (resource.resource_type_detail ? resource.resource_type_detail.id : ''));
      setLocation(resource.location || '');
      setCapacity(resource.capacity || 30);
      setDescription(resource.description || '');
      setFeaturesStr(Array.isArray(resource.features) ? resource.features.join(', ') : '');
      setImageUrl(resource.image_url || '');
      setStatusVal(resource.status || 'available');
    } else {
      setName('');
      setResourceTypeId(types.length > 0 ? types[0].id : '');
      setLocation('');
      setCapacity(30);
      setDescription('');
      setFeaturesStr('Smart Board, Central AC, High-Speed Wi-Fi');
      setImageUrl('');
      setStatusVal('available');
    }
    setError(null);
  }, [resource, types, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const featuresArray = featuresStr
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    const payload = {
      name: name.trim(),
      resource_type: parseInt(resourceTypeId, 10),
      location: location.trim(),
      capacity: parseInt(capacity, 10) || 1,
      description: description.trim(),
      features: featuresArray,
      image_url: imageUrl.trim(),
      status: statusVal,
    };

    try {
      let savedResource;
      if (isEditMode) {
        savedResource = await api.resources.update(resource.id, payload);
      } else {
        savedResource = await api.resources.create(payload);
      }
      onSuccess(savedResource);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save resource.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
              Campus Facilities & Equipment
            </div>
            <h3 className="text-base font-bold text-slate-900">
              {isEditMode ? `Edit Resource: ${resource.name}` : 'Add New Campus Resource'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Resource Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Advanced Robotics & Automation Lab"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              id="resource-name-input"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Category / Type *</label>
              <select
                required
                value={resourceTypeId}
                onChange={(e) => setResourceTypeId(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="resource-type-input"
              >
                <option value="">Select Category</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Operational Status *</label>
              <select
                required
                value={statusVal}
                onChange={(e) => setStatusVal(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="resource-status-input"
              >
                <option value="available">Available</option>
                <option value="maintenance">Under Maintenance</option>
                <option value="reserved">Reserved</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Location *</label>
              <input
                type="text"
                required
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Block 38, Floor 2, Room 204"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="resource-location-input"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Max Capacity (Seats) *</label>
              <input
                type="number"
                min="1"
                required
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="e.g. 40"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="resource-capacity-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Detailed Description *</label>
            <textarea
              required
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe specifications, specialized instruments, safety rules..."
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              id="resource-description-input"
            ></textarea>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Features & Equipment (Comma-separated)
            </label>
            <input
              type="text"
              value={featuresStr}
              onChange={(e) => setFeaturesStr(e.target.value)}
              placeholder="e.g. Interactive Screen, Dual Laser Projector, Surround Audio, AC"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              id="resource-features-input"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Image URL (Optional)</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              id="resource-image-input"
            />
          </div>

          {/* Modal Actions */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
              id="save-resource-submit-btn"
            >
              {submitting ? 'Saving Resource...' : isEditMode ? 'Update Resource' : 'Create Resource'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

