// ============================================
// MOBILE API SERVICE
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// YOUR NGROK URL – CHANGE THIS WHEN DEPLOYING
const DEV_API_URL = 'https://balancing-treble-prevent.ngrok-free.dev/api';
const PROD_API_URL = 'https://api.futurejobspro.com/api';

export const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.client.interceptors.request.use(async (config) => {
      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }
      return config;
    });
  }

  async setToken(token: string): Promise<void> {
    this.token = token;
    await SecureStore.setItemAsync('authToken', token);
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
  }

  async get<T>(url: string): Promise<T> {
    const response = await this.client.get<T>(url);
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  async uploadFile<T>(url: string, fileUri: string, fieldName = 'file'): Promise<T> {
    const formData = new FormData();
    const filename = fileUri.split('/').pop() || 'file.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append(fieldName, {
      uri: fileUri,
      name: filename,
      type,
    } as any);

    const response = await this.client.post<T>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
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
    if (userData) {
      return JSON.parse(userData).id;
    }
    return 'anonymous';
  }
}

export const api = new ApiService();