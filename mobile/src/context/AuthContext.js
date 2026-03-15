import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import api from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  async function loadStoredAuth() {
    try {
      const storedToken = await SecureStore.getItemAsync('authToken');
      if (storedToken) {
        setToken(storedToken);
        const { data } = await api.get('/api/auth/me');
        setUser(data.user);
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
    return data;
  }

  async function logout() {
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
