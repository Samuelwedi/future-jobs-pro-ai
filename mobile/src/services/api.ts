// ============================================
// MOBILE API SERVICE (with DELETE support & 401 handling)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { getOnlineStatus, queueAction } from './offlineService';

// Railway permanent backend
const DEV_API_URL = 'https://future-jobs-pro-ai-production.up.railway.app/api';
const PROD_API_URL = 'https://future-jobs-pro-ai-production.up.railway.app/api';
export const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;

console.log('🚀 API_URL:', API_URL);

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  constructor() {
    this.client = axios.create({
  baseURL: API_URL,
  timeout: 60000, // Increase to 60 seconds
  headers: { 'Content-Type': 'application/json' },
});
    // --- Request interceptor: add token ---
    this.client.interceptors.request.use(
      async (config) => {
        let token = this.token;
        if (!token) {
          token = await SecureStore.getItemAsync('authToken');
          if (token) {
            this.token = token;
          }
        }

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          console.log('🔑 Authorization header added for:', config.url, 'token first 10 chars:', token.substring(0, 10) + '...');
        } else {
          console.log('⚠️ No token available for request:', config.url);
        }

        // Send test user header (for review)
        config.headers['X-Test-User'] = 'samuel@test.com';

        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // --- Response interceptor: handle 401 ---
    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          console.warn('🔑 Token expired – redirecting to login');
          await this.clearToken();
          if (this.onUnauthorized) {
            this.onUnauthorized();
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Set handler for unauthorized responses
  setUnauthorizedHandler(handler: () => void): void {
    this.onUnauthorized = handler;
  }

  async setToken(token: string): Promise<void> {
    console.log('🔑 api.setToken called, token length:', token.length);
    this.token = token;
    await SecureStore.setItemAsync('authToken', token);
    console.log('✅ Token stored in SecureStore');
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await SecureStore.getItemAsync('authToken');
    }
    return this.token;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    await SecureStore.deleteItemAsync('authToken');
    console.log('🗑️ Token cleared');
  }

  async get<T>(url: string): Promise<T> {
    console.log('📤 GET', this.client.defaults.baseURL + url);
    const response = await this.client.get<T>(url);
    console.log('✅ GET /' + url + ' success', response.data);
    return response.data;
  }

  async post<T>(url: string, data?: any, p0?: { headers: { 'Content-Type': string; }; }): Promise<T> {
    const online = getOnlineStatus();
    if (!online) {
      console.log('📴 Offline – queuing action:', url);
      await queueAction({ method: 'POST', url, data });
      throw new Error('Offline – action queued for later');
    }
    console.log('📤 POST', this.client.defaults.baseURL + url, data);
    const response = await this.client.post<T>(url, data);
    console.log('✅ POST /' + url + ' success', response.data);
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const online = getOnlineStatus();
    if (!online) {
      console.log('📴 Offline – queuing action:', url);
      await queueAction({ method: 'PUT', url, data });
      throw new Error('Offline – action queued for later');
    }
    console.log('📤 PUT', this.client.defaults.baseURL + url, data);
    const response = await this.client.put<T>(url, data);
    console.log('✅ PUT /' + url + ' success', response.data);
    return response.data;
  }

  async patch<T>(url: string, data?: any): Promise<T> {
    const online = getOnlineStatus();
    if (!online) {
      console.log('📴 Offline – queuing action:', url);
      await queueAction({ method: 'PATCH', url, data });
      throw new Error('Offline – action queued for later');
    }
    console.log('📤 PATCH', this.client.defaults.baseURL + url, data);
    const response = await this.client.patch<T>(url, data);
    console.log('✅ PATCH /' + url + ' success', response.data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const online = getOnlineStatus();
    if (!online) {
      console.log('📴 Offline – queuing action:', url);
      await queueAction({ method: 'DELETE', url });
      throw new Error('Offline – action queued for later');
    }
    console.log('📤 DELETE', this.client.defaults.baseURL + url);
    const response = await this.client.delete<T>(url);
    console.log('✅ DELETE /' + url + ' success', response.data);
    return response.data;
  }

  async uploadFileWithData<T>(
    url: string,
    fileUri: string,
    extraFields: Record<string, string>,
    fieldName = 'photo'
  ): Promise<T> {
    const online = getOnlineStatus();
    if (!online) {
      console.log('📴 Offline – queuing upload:', url);
      const permanentUri = (FileSystem as any).documentDirectory + `offline-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: fileUri, to: permanentUri });
      await queueAction({ method: 'POST', url, data: extraFields, fileUri: permanentUri, fieldName });
      throw new Error('Offline – upload queued for later');
    }

    const formData = new FormData();
    const filename = fileUri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const extension = match?.[1]?.toLowerCase();
    const type = fieldName === 'audio'
      ? extension === 'wav' ? 'audio/wav'
        : extension === 'mp3' ? 'audio/mpeg'
        : extension === 'caf' ? 'audio/x-caf'
        : 'audio/mp4'
      : extension ? `image/${extension}` : 'image/jpeg';
    formData.append(fieldName, { uri: fileUri, name: filename, type } as any);
    Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));

    console.log('📤 UPLOAD', this.client.defaults.baseURL + url, { file: filename, extraFields });
    const response = await this.client.post<T>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    console.log('✅ UPLOAD /' + url + ' success', response.data);
    return response.data;
  }

  async uploadFile<T>(url: string, fileUri: string, fieldName = 'file'): Promise<T> {
    return this.uploadFileWithData<T>(url, fileUri, {}, fieldName);
  }

  async recordAIEvent(eventType: string, eventData: any, location?: { lat: number; lng: number }): Promise<void> {
    try {
      const userId = await this.getCurrentUserId();
      await this.post('/ai/event', {
        userId,
        eventType,
        eventData: { ...eventData, timestamp: new Date().toISOString() },
        latitude: location?.lat,
        longitude: location?.lng,
        deviceInfo: { platform: Platform.OS, version: Platform.Version },
      });
    } catch (error) {
      console.error('Failed to record AI event:', error);
    }
  }

  async getAISuggestions(): Promise<any> {
    const userId = await this.getCurrentUserId();
    return this.get(`/ai/suggestions/${userId}`);
  }

  async dismissSuggestion(suggestionId: string): Promise<void> {
    await this.post(`/ai/suggestions/${suggestionId}/dismiss`);
  }

  private async getCurrentUserId(): Promise<string> {
    const userData = await SecureStore.getItemAsync('userData');
    if (userData) return JSON.parse(userData).id;
    return 'anonymous';
  }
}

export const api = new ApiService();
