const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000/api';

export async function apiRequest(endpoint, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('p20_auth_token') : null;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Token ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
    cancel: (id) => apiRequest(`/bookings/${id}/cancel/`, { method: 'POST' }),
    manage: () => apiRequest('/bookings/manage/'),
  },
};
