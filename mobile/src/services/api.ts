import { isPayrollMutation } from '../utils/manualPayroll';
// ============================================
// MOBILE API SERVICE (with DELETE support & 401 handling)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { uploadMetadata } from '../utils/uploadMetadata';
import axios, { AxiosInstance } from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { checkOnlineStatus, getOnlineStatus, queueAction } from './offlineService';

// Railway permanent backend
const DEV_API_URL = 'https://future-jobs-pro-ai-production.up.railway.app/api';
const PROD_API_URL = 'https://future-jobs-pro-ai-production.up.railway.app/api';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEV_API_URL : PROD_API_URL)).replace(/\/$/,'');

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;
  private onSubscriptionRequired: (() => void) | null = null;
  setSubscriptionRequiredHandler(handler:()=>void){this.onSubscriptionRequired=handler;}
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

        } else {

        }

        // Send test user header (for review)


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
        if (error.response?.status === 402) this.onSubscriptionRequired?.();
        if (error.response?.status === 401) {
          console.warn('🔑 Token expired – redirecting to login');
          try { await this.clearToken(); } finally { this.onUnauthorized?.(); }
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

  async replayQueued(action:any):Promise<void>{
    if(isPayrollMutation(action.url)) throw new Error('Payroll cannot be replayed from an offline queue. Open payroll and review the current records.');
    if(action.fileUri){await this.uploadFileWithData(action.url,action.fileUri,action.data||{},action.fieldName||'file',true,action.fileInfo);return;}
    await this.client.request({method:action.method,url:action.url,data:action.data});
  }
  async get<T>(url: string): Promise<T> {

    const response = await this.client.get<T>(url);

    return response.data;
  }

  async post<T>(url: string, data?: any, p0?: { headers: { 'Content-Type': string; }; }): Promise<T> {
    const online = getOnlineStatus();
    if (!online && isPayrollMutation(url)) throw new Error('Payroll requires an online connection. Nothing was queued or saved.');
    if (!online) {

      await queueAction({ method: 'POST', url, data });
      throw new Error('Offline – action queued for later');
    }

    const response = await this.client.post<T>(url, data, p0);

    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const online = getOnlineStatus();
    if (!online && isPayrollMutation(url)) throw new Error('Payroll requires an online connection. Nothing was queued or saved.');
    if (!online) {

      await queueAction({ method: 'PUT', url, data });
      throw new Error('Offline – action queued for later');
    }

    const response = await this.client.put<T>(url, data);

    return response.data;
  }

  async patch<T>(url: string, data?: any): Promise<T> {
    const online = getOnlineStatus();
    if (!online && isPayrollMutation(url)) throw new Error('Payroll requires an online connection. Nothing was queued or saved.');
    if (!online) {

      await queueAction({ method: 'PATCH', url, data });
      throw new Error('Offline – action queued for later');
    }

    const response = await this.client.patch<T>(url, data);

    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const online = getOnlineStatus();
    if (!online && isPayrollMutation(url)) throw new Error('Payroll requires an online connection. Nothing was queued or saved.');
    if (!online) {

      await queueAction({ method: 'DELETE', url });
      throw new Error('Offline – action queued for later');
    }

    const response = await this.client.delete<T>(url);

    return response.data;
  }

  async uploadFileWithData<T>(
    url: string,
    fileUri: string,
    extraFields: Record<string, string>,
    fieldName = 'photo',
    replay = false,
    fileInfo?: { name: string; mimeType?: string }
  ): Promise<T> {
    const online = await checkOnlineStatus();
    if (!online && !replay) {
      console.log('📴 Offline – queuing upload:', url);
      const extension = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(fileUri)?.[1] || (fieldName === 'audio' ? 'm4a' : 'jpg');
      if (!FileSystem.documentDirectory) throw new Error('Local storage is unavailable. Please retry when online.');
      const permanentUri = FileSystem.documentDirectory + `offline-${Date.now()}.${extension}`;
      await FileSystem.copyAsync({ from: fileUri, to: permanentUri });
      await queueAction({ method: 'POST', url, data: extraFields, fileUri: permanentUri, fieldName, fileInfo });
      throw new Error('Offline – upload queued for later');
    }

    const formData = new FormData();
    const {name: filename, type} = uploadMetadata(fileUri, fieldName, fileInfo);
    formData.append(fieldName, { uri: fileUri, name: filename, type } as any);
    Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));

    const response = await this.client.post<T>(url, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

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

