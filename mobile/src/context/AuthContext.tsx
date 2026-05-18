import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'boss' | 'manager' | 'employee';
  companyId: string;
  companyName?: string;
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
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'boss' | 'manager' | 'employee';
  companyName?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    try {
      const token = await api.getToken();
      const userData = await SecureStore.getItemAsync('userData');
      if (token && userData) setUser(JSON.parse(userData));
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await api.post<{ token: string; user: User }>('/auth/login', { email, password });
    await api.setToken(response.token);
    await SecureStore.setItemAsync('userData', JSON.stringify(response.user));
    setUser(response.user);
    await api.recordAIEvent('login', { email });
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch (e) {}
    await api.clearToken();
    await SecureStore.deleteItemAsync('userData');
    setUser(null);
  };

  const register = async (data: RegisterData) => {
    const response = await api.post<{ token: string; user: User }>('/auth/register', data);
    await api.setToken(response.token);
    await SecureStore.setItemAsync('userData', JSON.stringify(response.user));
    setUser(response.user);
    await api.recordAIEvent('register', { email: data.email, role: data.role });
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};