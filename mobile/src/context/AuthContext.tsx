import {stopBackgroundLocation} from '../services/backgroundLocation';
// ============================================
// AUTH CONTEXT
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { api } from '../services/api';
import { chatTextOutbox } from '../services/chatTextOutbox';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

interface User {
  mustChangePassword?: boolean;
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
  profilePic?: string | null;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isLogoutPending: () => boolean;
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

  const authEpoch = useRef(0);
  const logoutPending = useRef(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const userDataWrites = useRef<Promise<unknown>>(Promise.resolve());
  const storageExclusive = <T,>(work: () => Promise<T>): Promise<T> => {
    const next = userDataWrites.current.then(work);
    userDataWrites.current = next.catch(() => undefined);
    return next;
  };
  const writeCurrentUser = (next: User, current: () => boolean) => storageExclusive(async () => {
    if (!current()) return null;
    await SecureStore.setItemAsync('userData', JSON.stringify(next));
    if (!current()) return null;
    setUser(next); return next;
  });

  const refreshUser = async (): Promise<User | null> => {
    const epoch = authEpoch.current;
    const current = () => epoch === authEpoch.current && !logoutPending.current;
    if (!current()) return null;
    const token = await api.getToken();
    if (!token || !current()) return null;
    const sessionCurrent = api.captureSessionGuard();
    try {
      const response = await api.readAuthSession<{ success: boolean; user: User }>(current);
      if (!current() || !sessionCurrent()) return null;
      return await writeCurrentUser(response.user, () => current() && sessionCurrent());
    } catch (error: any) {
      if (!current() || !sessionCurrent()) return null;
      if (error?.response?.status === 401) await logout();
      throw error;
    }
  };

  useEffect(() => {
    const epoch = authEpoch.current;
    const current = () => epoch === authEpoch.current && !logoutPending.current;
    const loadSession = async () => {
      try {
        const token = await api.getToken();
        if (!current()) return;
        const sessionCurrent = api.captureSessionGuard();
        const userData = await SecureStore.getItemAsync('userData');
        if (!current() || (token && !sessionCurrent())) return;
        if (token && userData) setUser(JSON.parse(userData));
        if (token) await refreshUser();
      } catch (error) {
        if (current()) console.error('Session load error:', error);
      } finally { setIsLoading(false); }
    };
    void loadSession();
  }, []);

  useEffect(()=>{
    const subscription=AppState.addEventListener('change',state=>{if(state==='active'&&user)void refreshUser().catch(()=>{});});
    const timer=setInterval(()=>{if(user)void refreshUser().catch(()=>{});},60000);
    return()=>{subscription.remove();clearInterval(timer);};
  },[user?.id]);

  const login = async (email: string, password: string) => {
    if (logoutPending.current) throw new Error('Sign-out is still in progress.');
    const epoch = ++authEpoch.current;
    const current = () => epoch === authEpoch.current && !logoutPending.current;
    try {
      const response = await api.post<{ success: boolean; token: string; user: User }>('/auth/login', { email, password });
      if (!current()) return;
      if (response.success && response.token) {
        const settingToken = api.setToken(response.token);
        const sessionCurrent = api.captureSessionGuard();
        await settingToken;
        await writeCurrentUser(response.user, () => current() && sessionCurrent());
      } else {
        throw new Error('Login failed');
      }
    } catch (error) {
      console.error('❌ AuthContext.login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    if (logoutPending.current) return;
    logoutPending.current = true;
    authEpoch.current++;
    setIsLoggingOut(true);
    chatTextOutbox.pause(); // Synchronous, before cleanup or a replacement render.
    const clearing = api.clearToken().catch(() => undefined);
    await stopBackgroundLocation().catch(() => undefined);
    // Delete after an already-started refresh write settles, never before it.
    // Stale queued refresh writes check the epoch and cannot restore userData.
    await Promise.allSettled([clearing, storageExclusive(() => SecureStore.deleteItemAsync('userData'))]);
    setUser(null);
    logoutPending.current = false;
    setIsLoggingOut(false);
  };

  useEffect(() => {api.setUnauthorizedHandler(() => {void logout();}); return () => api.setUnauthorizedHandler(() => {});}, []);

  const register = async (data: RegisterData) => {
    if (logoutPending.current) throw new Error('Sign-out is still in progress.');
    const epoch = ++authEpoch.current;
    const current = () => epoch === authEpoch.current && !logoutPending.current;
    const response = await api.post<{ success: boolean; token: string; user: User }>('/auth/register', data);
    if (!current()) return;
    if (response.success && response.token) {
      const settingToken = api.setToken(response.token);
      const sessionCurrent = api.captureSessionGuard();
      await settingToken;
      await writeCurrentUser(response.user, () => current() && sessionCurrent());
    } else {
      throw new Error('Registration failed');
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading: isLoading || isLoggingOut, isAuthenticated: !!user && !isLoggingOut,
      isLogoutPending: () => logoutPending.current, login, logout, register, refreshUser }}>
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
