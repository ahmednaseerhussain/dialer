import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
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
    Location.requestForegroundPermissionsAsync().then(async ({ status }) => {
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Please enable location access in Settings so your location can be tracked.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }

      // Send last known position instantly (no GPS wait needed)
      try {
        const last = await Location.getLastKnownPositionAsync({ maxAge: 300000 });
        if (last) {
          api.post('/api/location', {
            lat: last.coords.latitude,
            lng: last.coords.longitude,
          }).catch(() => {});
        }
      } catch {}

      // Watch for live position updates every 30s or when moved 50m
      try {
        const sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 30000,
            distanceInterval: 50,
          },
          (loc) => {
            api.post('/api/location', {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            }).catch(() => {});
          }
        );
        locationInterval.current = sub;
      } catch {}
    });
  }

  function stopLocationTracking() {
    if (locationInterval.current) {
      locationInterval.current.remove();
      locationInterval.current = null;
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
