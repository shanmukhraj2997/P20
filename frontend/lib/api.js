const getApiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname) {
    return `http://${window.location.hostname}:8000/api`;
  }
  return 'http://127.0.0.1:8000/api';
};

export async function apiRequest(endpoint, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('p20_auth_token') : null;
  const baseUrl = getApiBaseUrl();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Token ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let errorMessage = data.message || data.detail;
    if (!errorMessage && typeof data === 'object' && Object.keys(data).length > 0) {
      // DRF field validation errors formatting
      const fieldErrors = Object.entries(data)
        .map(([field, errs]) => {
          const detail = Array.isArray(errs) ? errs.join(', ') : String(errs);
          return field === 'non_field_errors' ? detail : `${field}: ${detail}`;
        })
        .join(' | ');
      if (fieldErrors) errorMessage = fieldErrors;
    }

    const error = new Error(errorMessage || `HTTP ${response.status}: Request failed`);
    error.status = response.status;
    error.data = data;
    error.errorCode = data.error || 'request_error';
    throw error;
  }

  return data;
}

export const api = {
  health: () => apiRequest('/health/'),
  roles: () => apiRequest('/accounts/roles/'),
  login: (credentials) => apiRequest('/accounts/login/', { method: 'POST', body: JSON.stringify(credentials) }),
  register: (userData) => apiRequest('/accounts/register/', { method: 'POST', body: JSON.stringify(userData) }),
  logout: () => apiRequest('/accounts/logout/', { method: 'POST' }),
  me: () => apiRequest('/accounts/me/'),
  dashboardStats: () => apiRequest('/accounts/dashboard-stats/'),
  updateUserRole: (userId, role) => apiRequest(`/accounts/users/${userId}/role/`, { method: 'PATCH', body: JSON.stringify({ role }) }),

  // Resource Catalogue endpoints (M1)
  resourceTypes: () => apiRequest('/resources/types/'),
  resources: {
    list: (params = {}) => {
      const queryString = new URLSearchParams();
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          queryString.append(key, val);
        }
      });
      const qs = queryString.toString();
      return apiRequest(`/resources/${qs ? `?${qs}` : ''}`);
    },
    get: (id) => apiRequest(`/resources/${id}/`),
    create: (resourceData) => apiRequest('/resources/', { method: 'POST', body: JSON.stringify(resourceData) }),
    update: (id, resourceData) => apiRequest(`/resources/${id}/`, { method: 'PATCH', body: JSON.stringify(resourceData) }),
    delete: (id) => apiRequest(`/resources/${id}/`, { method: 'DELETE' }),
    availability: (id, start, end) => {
      const params = new URLSearchParams();
      if (start) params.append('start', start);
      if (end) params.append('end', end);
      const qs = params.toString();
      return apiRequest(`/resources/${id}/availability/${qs ? `?${qs}` : ''}`);
    },
  },

  // Booking Engine endpoints (M3)
  bookings: {
    create: (bookingData) => apiRequest('/bookings/', { method: 'POST', body: JSON.stringify(bookingData) }),
    list: () => apiRequest('/bookings/'),
    get: (id) => apiRequest(`/bookings/${id}/`),
    cancel: (id, cancelSeries = false) => apiRequest(`/bookings/${id}/cancel/`, {
      method: 'POST',
      body: JSON.stringify({ cancel_series: cancelSeries })
    }),
    manage: (params = {}) => {
      const qs = typeof params === 'string' ? params : new URLSearchParams(params).toString();
      return apiRequest(`/bookings/manage/${qs ? `?${qs}` : ''}`);
    },
    approve: (id, note = '') => apiRequest(`/bookings/${id}/approve/`, { method: 'POST', body: JSON.stringify({ decision_note: note }) }),
    reject: (id, note) => apiRequest(`/bookings/${id}/reject/`, { method: 'POST', body: JSON.stringify({ decision_note: note }) }),
    getQr: (id) => apiRequest(`/bookings/${id}/qr/?format=json`),
    getQrRawUrl: (id) => `${getApiBaseUrl()}/bookings/${id}/qr/`,
    checkIn: (id, payload = {}) => apiRequest(`/bookings/${id}/check-in/`, { method: 'POST', body: JSON.stringify(payload) }),
    checkInWithToken: (payload) => apiRequest('/bookings/check-in/', { method: 'POST', body: JSON.stringify(payload) }),
    exportAllIcsUrl: () => `${getApiBaseUrl()}/bookings/export.ics`,
    exportBookingIcsUrl: (id) => `${getApiBaseUrl()}/bookings/${id}/export.ics`,
  },

  // Timetable Integration (M6)
  timetable: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiRequest(`/bookings/timetable/${qs ? `?${qs}` : ''}`);
    },
    importCsv: (csvData) => apiRequest('/bookings/timetable/import/', {
      method: 'POST',
      body: JSON.stringify({ csv_data: csvData })
    }),
  },

  // Maintenance & Blackout endpoints (M7)
  maintenance: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiRequest(`/availability/maintenance/${qs ? `?${qs}` : ''}`);
    },
    get: (id) => apiRequest(`/availability/maintenance/${id}/`),
    create: (data) => apiRequest('/availability/maintenance/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/availability/maintenance/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/availability/maintenance/${id}/`, { method: 'DELETE' }),
  },

  // Consumables & Equipment Accessories (M8)
  consumables: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiRequest(`/resources/consumables/${qs ? `?${qs}` : ''}`);
    },
    get: (id) => apiRequest(`/resources/consumables/${id}/`),
    create: (data) => apiRequest('/resources/consumables/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => apiRequest(`/resources/consumables/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    adjustStock: (id, data) => apiRequest(`/resources/consumables/${id}/adjust-stock/`, { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => apiRequest(`/resources/consumables/${id}/`, { method: 'DELETE' }),
  },

  // In-app Notifications
  notifications: {
    list: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiRequest(`/accounts/notifications/${qs ? `?${qs}` : ''}`);
    },
    markRead: (id) => apiRequest(`/accounts/notifications/${id}/read/`, { method: 'POST' }),
    markAllRead: () => apiRequest('/accounts/notifications/mark-all-read/', { method: 'POST' }),
  },

  // Analytics & Reporting (M9)
  analytics: {
    dashboard: (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return apiRequest(`/analytics/dashboard/${qs ? `?${qs}` : ''}`);
    },
    downloadBookingsCsv: async (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      const baseUrl = getApiBaseUrl();
      const token = typeof window !== 'undefined' ? localStorage.getItem('p20_auth_token') : null;
      const res = await fetch(`${baseUrl}/analytics/reports/bookings/export-csv/${qs ? `?${qs}` : ''}`, {
        headers: {
          ...(token ? { 'Authorization': `Token ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to export bookings CSV');
      return res.blob();
    },
    downloadUsageCsv: async (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      const baseUrl = getApiBaseUrl();
      const token = typeof window !== 'undefined' ? localStorage.getItem('p20_auth_token') : null;
      const res = await fetch(`${baseUrl}/analytics/reports/usage/export-csv/${qs ? `?${qs}` : ''}`, {
        headers: {
          ...(token ? { 'Authorization': `Token ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Failed to export usage CSV');
      return res.blob();
    },
  },
};
