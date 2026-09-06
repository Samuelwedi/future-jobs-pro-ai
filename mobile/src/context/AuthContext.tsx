// ============================================
// AUTH CONTEXT
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '../services/api';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  first_name?: string;
  last_name?: string;
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
  refreshUser: () => Promise<User | null>;
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

  const refreshUser = async (): Promise<User | null> => {
    const token=await api.getToken();
    if(!token)return null;
    try{
      const response=await api.get<{success:boolean;user:User}>('/auth/session');
      await SecureStore.setItemAsync('userData',JSON.stringify(response.user));
      setUser(response.user);return response.user;
    }catch(error:any){
      if(error?.response?.status===401){await api.clearToken();await SecureStore.deleteItemAsync('userData');setUser(null);}
      throw error;
    }
  };

  useEffect(() => {
    // Check for existing session
    const loadSession = async () => {
      try {
        const token = await api.getToken();
        const userData = await SecureStore.getItemAsync('userData');
        if (token && userData) setUser(JSON.parse(userData));
        if (token) await refreshUser();
      } catch (e) {
        console.error('Session load error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSession();
  }, []);

  useEffect(()=>{
    const subscription=AppState.addEventListener('change',state=>{if(state==='active'&&user)void refreshUser().catch(()=>{});});
    const timer=setInterval(()=>{if(user)void refreshUser().catch(()=>{});},60000);
    return()=>{subscription.remove();clearInterval(timer);};
  },[user?.id]);

  const login = async (email: string, password: string) => {
    try {
      const response = await api.post<{ success: boolean; token: string; user: User }>('/auth/login', { email, password });
      if (response.success && response.token) {
        await api.setToken(response.token);
        await SecureStore.setItemAsync('userData', JSON.stringify(response.user));
        setUser(response.user);
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
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout, register, refreshUser }}>
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
