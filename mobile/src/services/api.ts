// ============================================
// MOBILE API SERVICE (with DELETE support)
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

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    // Interceptor to add Authorization header
    this.client.interceptors.request.use(
      async (config) => {
        // Use cached token first
        let token = this.token;
        if (!token) {
          // Fallback: read from SecureStore
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

        // Always send test user header (for review)
        config.headers['X-Test-User'] = 'samuel@test.com';

        return config;
      },
      (error) => {
        console.error('❌ Request interceptor error:', error);
        return Promise.reject(error);
      }
    );
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

  async post<T>(url: string, data?: any): Promise<T> {
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
    const type = match ? `image/${match[1]}` : 'image/jpeg';
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