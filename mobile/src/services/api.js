import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Change this to your backend URL
const API_BASE_URL = 'https://dialer-5bfg.onrender.com';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// JWT interceptor — attach token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Notify the app when the session dies (e.g. JWT expired after 8h) so the
// UI can log out instead of sitting in a zombie state where every request
// silently fails and incoming-call registration stops working.
let onAuthExpired = null;
export function setOnAuthExpired(fn) {
  onAuthExpired = fn;
}

// Response interceptor — handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const isLoginAttempt = error.config?.url?.includes('/api/auth/login');
      if (!isLoginAttempt) {
        await SecureStore.deleteItemAsync('authToken');
        if (onAuthExpired) onAuthExpired();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
