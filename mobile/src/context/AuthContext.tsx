// ============================================
// AUTH CONTEXT
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import * as SecureStore from 'expo-secure-store';

interface User {
  first_name: string;
  last_name: string;
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  fullName: string;
  trialEndsAt: string;
  companyId: string;
  hasPaymentMethod: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const loadSession = async () => {
      try {
        const token = await api.getToken();
        const userData = await SecureStore.getItemAsync('userData');
        if (token && userData) {
          setUser(JSON.parse(userData));
        }
      } catch (e) {
        console.error('Session load error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, []);

  const login = async (email: string, password: string) => {
    console.log('🔑 AuthContext.login called with:', email);
    try {
      const response = await api.post<{ success: boolean; token: string; user: User }>('/auth/login', { email, password });
      console.log('✅ AuthContext.login response:', response);
      if (response.success && response.token) {
        await api.setToken(response.token);
        await SecureStore.setItemAsync('userData', JSON.stringify(response.user));
        setUser(response.user);
        console.log('✅ AuthContext.login: user set');
      } else {
        throw new Error('Login failed');
      }
    } catch (error) {
      console.error('❌ AuthContext.login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    await api.clearToken();
    await SecureStore.deleteItemAsync('userData');
    setUser(null);
  };

  const register = async (data: RegisterData) => {
    const response = await api.post<{ success: boolean; token: string; user: User }>('/auth/register', data);
    if (response.success && response.token) {
      await api.setToken(response.token);
      await SecureStore.setItemAsync('userData', JSON.stringify(response.user));
      setUser(response.user);
    } else {
      throw new Error('Registration failed');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};