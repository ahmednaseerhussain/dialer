import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const locationInterval = useRef(null);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  function startLocationTracking() {
    // Request permission once, then start 30s interval
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      // Send immediately on start
      sendLocation();
      locationInterval.current = setInterval(sendLocation, 30000);
    });
  }

  function stopLocationTracking() {
    if (locationInterval.current) {
      clearInterval(locationInterval.current);
      locationInterval.current = null;
    }
  }

  async function sendLocation() {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.post('/api/location', {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
      });
    } catch {
      // Silent fail — location is best-effort
    }
  }

  async function loadStoredAuth() {
    try {
      const storedToken = await SecureStore.getItemAsync('authToken');
      if (storedToken) {
        setToken(storedToken);
        const { data } = await api.get('/api/auth/me');
        setUser(data.user);
        startLocationTracking();
      }
    } catch {
      await SecureStore.deleteItemAsync('authToken');
    } finally {
      setLoading(false);
    }
  }

  async function login(username, password) {
    const { data } = await api.post('/api/auth/login', { username, password });
    await SecureStore.setItemAsync('authToken', data.token);
    setToken(data.token);
    setUser(data.user);
    startLocationTracking();
    return data;
  }

  async function logout() {
    stopLocationTracking();
    await SecureStore.deleteItemAsync('authToken');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
