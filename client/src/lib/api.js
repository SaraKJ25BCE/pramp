import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

const PUBLIC_AUTH_PATHS = ['/login', '/auth/callback'];

function isPublicAuthRoute() {
  const path = window.location.pathname;
  return PUBLIC_AUTH_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('proofstamp_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      const hadToken = !!localStorage.getItem('proofstamp_token');
      localStorage.removeItem('proofstamp_token');
      if (hadToken && !isPublicAuthRoute()) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export default api;
