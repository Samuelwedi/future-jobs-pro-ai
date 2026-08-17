import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

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
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
}

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const SESSION_RESTORE_TIMEOUT_MS = 2500;

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Session restore timed out')),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const [token, userData] = await withTimeout(
          Promise.all([
            api.getToken(),
            SecureStore.getItemAsync('userData'),
          ]),
          SESSION_RESTORE_TIMEOUT_MS,
        );

        if (!mounted) return;

        if (token && userData) {
          setUser(JSON.parse(userData));
          return;
        }

        // A partial session cannot be trusted. Remove it without blocking launch.
        void Promise.allSettled([
          api.clearToken(),
          SecureStore.deleteItemAsync('userData'),
        ]);
      } catch (error) {
        console.warn('Session restore skipped:', error);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    void loadSession();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post<{ success: boolean; token: string; user: User }>(
      '/auth/login',
      { email, password },
    );
    if (!response.success || !response.token) throw new Error('Login failed');

    await api.setToken(response.token);
    await SecureStore.setItemAsync('userData', JSON.stringify(response.user));
    setUser(response.user);
  };

  const register = async (data: RegisterData) => {
    const response = await api.post<{ success: boolean; token: string; user: User }>(
      '/auth/register',
      data,
    );
    if (!response.success || !response.token) throw new Error('Registration failed');

    await api.setToken(response.token);
    await SecureStore.setItemAsync('userData', JSON.stringify(response.user));
    setUser(response.user);
  };

  const logout = async () => {
    await api.clearToken();
    await SecureStore.deleteItemAsync('userData');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
