// ============================================
// MOBILE API SERVICE (with DELETE support & 401 handling)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

import { uploadMetadata } from '../utils/uploadMetadata';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { checkOnlineStatus, getOnlineStatus, queueAction, isEvidenceUpload, validEvidenceKey, getPendingEvidence, completeQueuedEvidence, requiresOnlineConfirmation } from './offlineService';

export type AttachmentSession = { token: string; revision: number; ownerId: string; companyId: string };
export type VoiceSession = Readonly<{ token: string; revision: number; ownerId: string; companyId: string }>;
type EvidenceConfig = AxiosRequestConfig & { expectedAuthToken: string; expectedAuthRevision?: number; expectedCurrent?: () => boolean; expectedBeforeDispatch?: () => Promise<void>; fenceUnauthorizedToCurrent?: boolean };
export const createEvidenceRequestKey = () => `evidence-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
function evidenceError(code:string,message:string){return Object.assign(new Error(message),{code});}
const pendingEvidence = () => evidenceError('EVIDENCE_PENDING','Upload status is pending or unavailable. Your capture is saved on this device. Check its status before taking another.');

// Railway permanent backend
const DEV_API_URL = 'https://future-jobs-pro-ai-production.up.railway.app/api';
const PROD_API_URL = 'https://future-jobs-pro-ai-production.up.railway.app/api';
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEV_API_URL : PROD_API_URL)).replace(/\/$/,'');

class ApiService {
  private client: AxiosInstance;
  private token: string | null = null;
  private authRevision = 0;
  private evidenceInFlight = new Map<string,Promise<any>>();
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
        const revision = this.authRevision;
        const token = this.token || await this.getToken();
        const expected = (config as EvidenceConfig).expectedAuthToken;
        const expectedRevision = (config as EvidenceConfig).expectedAuthRevision;
        if (expected && (token !== expected || this.token !== expected || revision !== this.authRevision
          || (expectedRevision !== undefined && expectedRevision !== this.authRevision))) {
          throw evidenceError('EVIDENCE_ACCOUNT_CHANGED','Account changed. Reopen the saved capture in its original account.');
        }

        if ((config as EvidenceConfig).expectedCurrent && !(config as EvidenceConfig).expectedCurrent!()) {
          throw new Error('Attachment screen changed. Reopen the original time entry.');
        }

        const beforeDispatch = (config as EvidenceConfig).expectedBeforeDispatch;
        if (beforeDispatch) {
          await beforeDispatch();
          if (token !== this.token || revision !== this.authRevision
            || (expectedRevision !== undefined && expectedRevision !== this.authRevision)) {
            throw new Error('Account changed. Reopen the saved recording.');
          }
          if ((config as EvidenceConfig).expectedCurrent && !(config as EvidenceConfig).expectedCurrent!()) {
            throw new Error('Voice screen changed. Reopen the original recording.');
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
        const expected = (error.config as EvidenceConfig | undefined)?.expectedAuthToken;
        const expectedRevision = (error.config as EvidenceConfig | undefined)?.expectedAuthRevision;
        const expectedCurrent = (error.config as EvidenceConfig | undefined)?.expectedCurrent;
        if (error.response?.status === 402 && (!expected || expected === this.token)
          && (expectedRevision === undefined || expectedRevision === this.authRevision)
          && (!expectedCurrent || expectedCurrent())) this.onSubscriptionRequired?.();
        if (error.response?.status === 401 && (!expected || expected === this.token)
          && (expectedRevision === undefined || expectedRevision === this.authRevision)
          && (!(error.config as EvidenceConfig | undefined)?.fenceUnauthorizedToCurrent || !expectedCurrent || expectedCurrent())) {
          console.warn('🔑 Token expired – redirecting to login');
          const clearedRevision = this.authRevision + 1;
          try { await this.clearToken(); } finally {
            // A subscription response must not sign out an account that replaced
            // the failed session while secure storage was being cleared.
            if (!(error.config as EvidenceConfig | undefined)?.fenceUnauthorizedToCurrent
              || (this.authRevision === clearedRevision && this.token === null)) this.onUnauthorized?.();
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
    this.authRevision++;
    this.token = token;
    await SecureStore.setItemAsync('authToken', token);

  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      const revision = this.authRevision;
      const token = await SecureStore.getItemAsync('authToken');
      if (revision === this.authRevision) this.token = token;
    }
    return this.token;
  }

  async clearToken(): Promise<void> {
    this.authRevision++;
    this.token = null;
    await SecureStore.deleteItemAsync('authToken');

  }

  async replayQueued(action:any):Promise<void>{
    if(requiresOnlineConfirmation(action.url))throw new Error('This saved action needs online review and cannot be replayed.');
    if(isEvidenceUpload(action.url)&&(!validEvidenceKey(action.data?.requestKey)||!action.fileUri))throw new Error('This older evidence upload needs review before it can be sent.');
    if(action.fileUri){await this.uploadFileWithData(action.url,action.fileUri,action.data||{},action.fieldName||'file',true,action.fileInfo,undefined,action.ownerId);return;}
    await this.client.request({method:action.method,url:action.url,data:action.data});
  }
  async get<T>(url: string): Promise<T> {

    const response = await this.client.get<T>(url);

    return response.data;
  }

  async getProjectFiles(projectId: string, owner: { id: string; companyId: string; role: string }, current: () => boolean): Promise<{ data: unknown; isSessionCurrent: () => boolean }> {
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const isSessionCurrent = () => !!token && token === this.token && revision === this.authRevision;
    const assertCurrent = () => {
      if (!isSessionCurrent() || !current()) {
        throw new Error('Account or project changed. Reopen project files.');
      }
    };
    assertCurrent();
    if (!projectId || !owner.id || !owner.companyId) throw new Error('A current project and account are required');
    const stored = JSON.parse(await SecureStore.getItemAsync('userData') || 'null');
    assertCurrent();
    if (stored?.id !== owner.id || stored?.companyId !== owner.companyId || stored?.role !== owner.role) {
      throw new Error('Account or project changed. Reopen project files.');
    }
    const response = await this.client.get(`/attachments?projectId=${encodeURIComponent(projectId)}`, {
      expectedAuthToken: token, expectedAuthRevision: revision, expectedCurrent: current,
    } as EvidenceConfig);
    assertCurrent();
    // Keep cached links tied to this session even while logout/login is awaiting
    // storage and AuthContext has not rendered the replacement user yet.
    return { data: response.data, isSessionCurrent };
  }

  async getChatRooms(owner: { id: string; companyId: string; role: string }, current: () => boolean): Promise<{ data: unknown; isSessionCurrent: () => boolean }> {
    const expectedOwner = { ...owner };
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const isSessionCurrent = () => !!token && token === this.token && revision === this.authRevision;
    const assertCurrent = () => {
      if (!isSessionCurrent() || !current()) throw new Error('Account or inbox changed. Refresh conversations.');
    };
    const beforeDispatch = async () => {
      assertCurrent();
      const stored = JSON.parse(await SecureStore.getItemAsync('userData') || 'null');
      assertCurrent();
      if (!expectedOwner.id || !expectedOwner.companyId || stored?.id !== expectedOwner.id
        || stored?.companyId !== expectedOwner.companyId || stored?.role !== expectedOwner.role) {
        throw new Error('Account or inbox changed. Refresh conversations.');
      }
    };
    await beforeDispatch();
    assertCurrent();
    const response = await this.client.get(`/chat/rooms/${encodeURIComponent(expectedOwner.id)}`, {
      expectedAuthToken: token!, expectedAuthRevision: revision, expectedCurrent: current,
      expectedBeforeDispatch: beforeDispatch, fenceUnauthorizedToCurrent: true,
    } as EvidenceConfig);
    assertCurrent();
    return { data: response.data, isSessionCurrent };
  }

  // Chat has no durable server idempotency contract. Keep every mutation online,
  // tied to the opening owner/session, and never replay an uncertain outcome.
  private async openChatTransport(owner: { id: string; companyId: string; role: string }, current: () => boolean) {
    const expectedOwner = { ...owner };
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const isCurrent = () => !!token && token === this.token && revision === this.authRevision && current();
    const assertCurrent = () => {
      if (!isCurrent()) throw evidenceError('CHAT_NOT_SENT', 'Account or conversation changed. Reopen the conversation.');
    };
    assertCurrent();
    const stored = JSON.parse(await SecureStore.getItemAsync('userData') || 'null');
    assertCurrent();
    if (!expectedOwner.id || !expectedOwner.companyId || stored?.id !== expectedOwner.id
      || stored?.companyId !== expectedOwner.companyId || stored?.role !== expectedOwner.role) {
      throw evidenceError('CHAT_NOT_SENT', 'Account or conversation changed. Reopen the conversation.');
    }
    const beforeDispatch = async () => {
      const latest = JSON.parse(await SecureStore.getItemAsync('userData') || 'null');
      assertCurrent();
      if (latest?.id !== expectedOwner.id || latest?.companyId !== expectedOwner.companyId || latest?.role !== expectedOwner.role) {
        throw evidenceError('CHAT_NOT_SENT', 'Account or conversation changed. Reopen the conversation.');
      }
    };
    const config = { expectedAuthToken: token!, expectedAuthRevision: revision, expectedCurrent: current, expectedBeforeDispatch: beforeDispatch, fenceUnauthorizedToCurrent: true } as EvidenceConfig;
    const read = async (url: string) => {
      assertCurrent();
      const response = await this.client.get(url, config);
      assertCurrent();
      return response.data;
    };
    const write = async (url: string, data: unknown, multipart = false) => {
      assertCurrent();
      const online = await checkOnlineStatus();
      assertCurrent();
      if (!online) throw evidenceError('CHAT_NOT_SENT', 'Offline. Nothing was sent or queued.');
      let response;
      try {
        response = await this.client.post(url, data, {
          ...config, ...(multipart ? { headers: { 'Content-Type': 'multipart/form-data' } } : {}),
        } as EvidenceConfig);
      } catch (error: any) {
        assertCurrent();
        // Multipart routes can return 400 even after commit. Only text 400
        // and pre-admission auth/size/type failures prove that nothing was saved.
        if (error?.code === 'CHAT_NOT_SENT' || [401, 403, 413, 415].includes(error?.response?.status)
          || (!multipart && error?.response?.status === 400)) {
          throw evidenceError('CHAT_NOT_SENT', 'Not sent. Check your access and message or file.');
        }
        throw evidenceError('CHAT_UNCERTAIN', 'Send not confirmed. Check the conversation before sending again.');
      }
      assertCurrent();
      return response.data;
    };
    return { token: token!, isCurrent, assertCurrent, read, write };
  }

  async openChatCreationSession(owner: { id: string; companyId: string; role: string }, current: () => boolean) {
    const { isCurrent, read, write } = await this.openChatTransport(owner, current);
    return {
      isCurrent,
      // This existing endpoint derives company from the authenticated user and
      // returns active coworkers only. Do not send a caller-selected company.
      readUsers: () => read('/users/company'),
      createDirect: (userId2: string) => write('/chat/create-direct', { userId2 }),
      createGroup: (name: string, memberIds: string[]) => write('/chat/create-group', { name, memberIds: [...memberIds] }),
    };
  }

  async openChatSession(roomId: string, owner: { id: string; companyId: string; role: string }, current: () => boolean) {
    if (!roomId) throw evidenceError('CHAT_NOT_SENT', 'A conversation is required.');
    const { token, isCurrent, assertCurrent, read, write } = await this.openChatTransport(owner, current);
    return {
      token, isCurrent,
      readMessages: () => read(`/chat/messages/${encodeURIComponent(roomId)}`),
      readRoom: () => read(`/chat/room/${encodeURIComponent(roomId)}/details`),
      sendMessage: (message: string) => write('/chat/message', { roomId, message }),
      upload: (kind: 'attachments' | 'photo', asset: { uri: string; name: string; mimeType?: string }) => {
        assertCurrent();
        const field = kind === 'photo' ? 'photo' : 'file';
        const metadata = uploadMetadata(asset.uri, field, asset);
        const form = new FormData();
        form.append(field, { uri: asset.uri, name: metadata.name, type: metadata.type } as any);
        return write(`/chat/room/${encodeURIComponent(roomId)}/${kind}`, form, true);
      },
    };
  }

  // A synchronous fence remains usable while AuthContext is awaiting storage.
  captureSessionGuard(): () => boolean {
    const token = this.token;
    const revision = this.authRevision;
    return () => !!token && token === this.token && revision === this.authRevision;
  }

  async readSubscription<T>(endpoint: 'status' | 'capabilities', owner: { id: string; companyId: string; role: string }, current: () => boolean): Promise<T> {
    const token = this.token;
    const revision = this.authRevision;
    const assertCurrent = () => {
      if (!token || token !== this.token || revision !== this.authRevision || !current()) {
        throw new Error('Account or subscription screen changed. Retry subscription status.');
      }
    };
    assertCurrent();
    const stored = JSON.parse(await SecureStore.getItemAsync('userData') || 'null');
    assertCurrent();
    if (!owner.id || !owner.companyId || stored?.id !== owner.id || stored?.companyId !== owner.companyId || stored?.role !== owner.role) {
      throw new Error('Account or subscription screen changed. Retry subscription status.');
    }
    const response = await this.client.get<T>(`/subscriptions/${endpoint}`, {
      expectedAuthToken: token, expectedAuthRevision: revision, expectedCurrent: current, fenceUnauthorizedToCurrent: true,
    } as EvidenceConfig);
    assertCurrent();
    return response.data;
  }

  private async clockRequestSession(owner: { id: string; companyId: string; role: string }, current: () => boolean) {
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const assertCurrent = () => {
      if (!token || token !== this.token || revision !== this.authRevision || !current()) {
        throw new Error('Account or shift screen changed. Refresh shift status.');
      }
    };
    assertCurrent();
    const stored = JSON.parse(await SecureStore.getItemAsync('userData') || 'null');
    assertCurrent();
    if (!owner.id || !owner.companyId || stored?.id !== owner.id || stored?.companyId !== owner.companyId || stored?.role !== owner.role) {
      throw new Error('Account or shift screen changed. Refresh shift status.');
    }
    return { assertCurrent, config: { expectedAuthToken: token, expectedAuthRevision: revision, expectedCurrent: current } as EvidenceConfig };
  }

  async postForegroundGps(data: Record<string, unknown>, owner: { id: string; companyId: string; role: string }, current: () => boolean) {
    const session = await this.clockRequestSession(owner, current);
    if (!await checkOnlineStatus()) throw new Error('GPS update requires an online connection.');
    session.assertCurrent();
    const response = await this.client.post('/gps/update', data, session.config);
    session.assertCurrent();
    return response.data;
  }

  async readActiveClock<T>(owner: { id: string; companyId: string; role: string }, current: () => boolean): Promise<T> {
    const session = await this.clockRequestSession(owner, current);
    const response = await this.client.get<T>(`/time-entries/active?userId=${encodeURIComponent(owner.id)}`, session.config);
    session.assertCurrent();
    return response.data;
  }

  async checkScheduleConflicts<T>(data: Record<string, unknown>,
    owner: { id: string; companyId: string; role: string }, current: () => boolean): Promise<T> {
    const session = await this.clockRequestSession(owner, current);
    if (!await checkOnlineStatus()) throw new Error('Overlap checks require an online connection.');
    session.assertCurrent();
    // A read-only POST: never enqueue or replay a stale preview.
    const response = await this.client.post<T>('/schedule/conflicts', data, session.config);
    session.assertCurrent();
    return response.data;
  }

  async writeClock<T>(action: 'in' | 'out', data: { projectId?: string; timeEntryId?: string; latitude: number | null; longitude: number | null },
    owner: { id: string; companyId: string; role: string }, current: () => boolean): Promise<T> {
    const session = await this.clockRequestSession(owner, current);
    if (!await checkOnlineStatus()) throw new Error('Connect to the internet to start or finish a shift.');
    session.assertCurrent();
    // Never enqueue a clock action: the server records its current time, not tap time.
    const response = await this.client.post<T>(`/time-entries/clock-${action}`, data, session.config);
    session.assertCurrent();
    return response.data;
  }

  async post<T>(url: string, data?: any, p0?: { headers: { 'Content-Type': string; }; }): Promise<T> {
    const online = getOnlineStatus();
    if (!online && /^\/(payroll-rules|manual-payroll)(\/|$)/.test(url)) throw new Error('Payroll requires an online connection. Nothing was queued or saved.');
    if (!online) {

      await queueAction({ method: 'POST', url, data });
      throw new Error('Offline – action queued for later');
    }

    const response = await this.client.post<T>(url, data, p0);

    return response.data;
  }

  // Lucy chat is an explicit online operation. Never store its prompt or replay
  // it through the offline queue; its caller owns the request receipt lifecycle.
  async postLucyChat<T>(data: Readonly<{requestId: string; message: string; language: string; channel: 'text'|'voice'; conversationMode?: boolean}>): Promise<{data: T; status: number}> {
    if (!getOnlineStatus()) throw new Error('Lucy requires an online connection. Nothing was queued.');
    const response = await this.client.post<T>('/lucy-v2', data);
    return {data: response.data, status: response.status};
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const online = getOnlineStatus();
    if (!online) {

      await queueAction({ method: 'PUT', url, data });
      throw new Error('Offline – action queued for later');
    }

    const response = await this.client.put<T>(url, data);

    return response.data;
  }

  async setProjectArchived<T>(projectId: string, archived: boolean): Promise<T> {
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const assertSession = () => {
      if (!token || token !== this.token || revision !== this.authRevision) throw new Error('Account changed. Reopen projects.');
    };
    assertSession();
    if (!await checkOnlineStatus()) throw new Error('Connect to the internet to archive or restore a project.');
    assertSession();
    const config = { expectedAuthToken: token } as EvidenceConfig;
    const url = `/projects/${encodeURIComponent(projectId)}`;
    const response = archived ? await this.client.delete<T>(url, config) : await this.client.post<T>(url + '/restore', {}, config);
    assertSession();
    return response.data;
  }

  async getVoiceTranscript<T>(noteId: string): Promise<T> {
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const assertSession = () => {
      if (!token || token !== this.token || revision !== this.authRevision) throw new Error('Account changed. Reopen the voice note.');
    };
    assertSession();
    const response = await this.client.get<T>(`/voice/${encodeURIComponent(noteId)}/transcript`, { expectedAuthToken: token } as EvidenceConfig);
    assertSession();
    return response.data;
  }

  async editVoiceTranscript<T>(noteId: string, transcript: string, expectedTranscript: string): Promise<T> {
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const assertSession = () => {
      if (!token || token !== this.token || revision !== this.authRevision) throw new Error('Account changed. Reopen the voice note.');
    };
    assertSession();
    if (!await checkOnlineStatus()) throw new Error('Connect to the internet to save transcript changes.');
    assertSession();
    const response = await this.client.patch<T>(`/voice/${encodeURIComponent(noteId)}/transcript`,
      { transcript, expectedTranscript }, { expectedAuthToken: token } as EvidenceConfig);
    assertSession();
    return response.data;
  }

  assertVoiceSession(session: VoiceSession) {
    if (!session.token || !session.ownerId || !session.companyId || this.token !== session.token || this.authRevision !== session.revision) {
      throw new Error('Account changed. Reopen the saved recording in its original account.');
    }
  }

  private async assertVoiceOwner(session: VoiceSession, current: () => boolean) {
    const assertCurrent = () => {
      this.assertVoiceSession(session);
      if (!current()) throw new Error('Voice screen changed. Reopen the original recording.');
    };
    assertCurrent();
    const raw = await SecureStore.getItemAsync('userData');
    assertCurrent();
    const user = raw ? JSON.parse(raw) : null;
    if (user?.id !== session.ownerId || user?.companyId !== session.companyId) {
      throw new Error('Account changed. Reopen the saved recording in its original account.');
    }
  }

  async getVoiceSession(ownerId: string, companyId: string): Promise<VoiceSession> {
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const session = Object.freeze({ token: token || '', revision, ownerId, companyId });
    await this.assertVoiceOwner(session, () => true);
    return session;
  }

  async captureVoiceSession(ownerId: string, companyId: string): Promise<VoiceSession> {
    return this.getVoiceSession(ownerId, companyId);
  }

  // Receipt requests never use the generic offline queue or retry provider work.
  async requestVoiceReceipt(session: VoiceSession, requestKey: string,
    file?: { uri: string; name: string; mimeType: string; projectId: string; timeEntryId: string | null; mode: 'audio-only' | 'audio-transcribed' },
    current: () => boolean = () => true) {
    if (!validEvidenceKey(requestKey)) throw new Error('A valid stable voice request key is required.');
    const identity = Object.freeze({ ...session });
    const payload = file ? Object.freeze({ ...file }) : undefined;
    if (payload && (!payload.uri || !payload.name || !payload.mimeType || !payload.projectId
      || (payload.timeEntryId !== null && (typeof payload.timeEntryId !== 'string' || !payload.timeEntryId))
      || !['audio-only', 'audio-transcribed'].includes(payload.mode))) throw new Error('The saved recording metadata is incomplete.');
    await this.assertVoiceOwner(identity, current);
    const online = await checkOnlineStatus();
    await this.assertVoiceOwner(identity, current);
    if (!online) throw new Error('Connect to the internet to check or send this saved recording. Nothing was queued.');
    const config: EvidenceConfig = {
      expectedAuthToken: identity.token, expectedAuthRevision: identity.revision, expectedCurrent: current,
      expectedBeforeDispatch: () => this.assertVoiceOwner(identity, current), timeout: 120000,
    };
    let response;
    if (payload) {
      const form = new FormData();
      // Exact retained name and MIME type are part of the server fingerprint.
      form.append('audio', { uri: payload.uri, name: payload.name, type: payload.mimeType } as any);
      form.append('requestKey', requestKey);
      form.append('projectId', payload.projectId);
      if (payload.timeEntryId !== null) form.append('timeEntryId', payload.timeEntryId);
      form.append('transcribe', payload.mode === 'audio-transcribed' ? 'true' : 'false');
      response = await this.client.post('/voice/process', form, { ...config, headers: { 'Content-Type': 'multipart/form-data' } });
    } else {
      response = await this.client.get(`/voice/requests/${encodeURIComponent(requestKey)}`, {
        ...config, params: { _: Date.now() }, headers: { 'Cache-Control': 'no-cache, no-store', Pragma: 'no-cache' },
        validateStatus: status => [200, 202, 404, 410].includes(status),
      } as EvidenceConfig);
    }
    await this.assertVoiceOwner(identity, current);
    return { status: response.status, data: response.data };
  }

  assertAttachmentSession(session: AttachmentSession) {
    if (!session.token || this.token !== session.token || this.authRevision !== session.revision) throw new Error('Account changed. Reopen the timesheet.');
  }

  async captureAttachmentSession(ownerId: string, companyId: string): Promise<AttachmentSession> {
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const session = { token: token || '', revision, ownerId, companyId };
    this.assertAttachmentSession(session);
    const raw = await SecureStore.getItemAsync('userData');
    this.assertAttachmentSession(session);
    const user = raw ? JSON.parse(raw) : null;
    if (!ownerId || !companyId || user?.id !== ownerId || user?.companyId !== companyId) throw new Error('Account changed. Reopen the timesheet.');
    return session;
  }

  async taskEvidence(session: AttachmentSession, taskId: string, current: () => boolean, submission?: {requestKey:string;note:string;file?:{uri:string;name:string;mimeType?:string}}, beforeDispatch?: () => Promise<void>) {
    this.assertAttachmentSession(session);
    if (!current()) throw new Error('Task screen changed.');
    const raw = await SecureStore.getItemAsync('userData');
    this.assertAttachmentSession(session);
    if (!current()) throw new Error('Task screen changed.');
    const user = raw ? JSON.parse(raw) : null;
    if (user?.id !== session.ownerId || user?.companyId !== session.companyId) throw new Error('Account changed. Reopen the task.');
    const config = { expectedAuthToken: session.token, expectedAuthRevision: session.revision, expectedCurrent: current, fenceUnauthorizedToCurrent: true } as EvidenceConfig;
    if (submission && beforeDispatch) config.expectedBeforeDispatch = beforeDispatch;
    const url = `/tasks/${encodeURIComponent(taskId)}/evidence`;
    let response;
    if (submission) {
      const form = new FormData();
      form.append('requestKey', submission.requestKey); form.append('note', submission.note);
      if (submission.file) {
        const file = submission.file;
        form.append('originalFileName', file.name);
        form.append('file', {uri:file.uri,name:file.name,type:file.mimeType || 'application/octet-stream'} as any);
      }
      response = await this.client.post(url, form, {...config,headers:{'Content-Type':'multipart/form-data'}});
    } else response = await this.client.get(url, config);
    this.assertAttachmentSession(session);
    if (!current()) throw new Error('Task screen changed.');
    return response.data;
  }

  async requestAttachmentReceipt(session: AttachmentSession, requestKey: string, file?: { uri: string; name: string; mimeType?: string; timeEntryId: string }, current: () => boolean = () => true) {
    this.assertAttachmentSession(session);
    if (!current()) throw new Error('Attachment screen changed. Reopen the original time entry.');
    const raw = await SecureStore.getItemAsync('userData');
    this.assertAttachmentSession(session);
    if (!current()) throw new Error('Attachment screen changed. Reopen the original time entry.');
    const user = raw ? JSON.parse(raw) : null;
    if (user?.id !== session.ownerId || user?.companyId !== session.companyId) throw new Error('Account changed. Reopen the timesheet.');
    const config = { expectedAuthToken: session.token, expectedAuthRevision: session.revision, expectedCurrent: current } as EvidenceConfig;
    let response;
    if (file) {
      const form = new FormData();
      const info = uploadMetadata(file.uri,'file',{name:file.name,mimeType:file.mimeType});
      form.append('file',{uri:file.uri,name:info.name,type:info.type} as any);
      form.append('originalFileName',file.name);
      form.append('timeEntryId',file.timeEntryId); form.append('requestKey',requestKey);
      response = await this.client.post('/attachments/upload',form,{...config,headers:{'Content-Type':'multipart/form-data'}});
    } else {
      response = await this.client.get(`/attachments/uploads/${encodeURIComponent(requestKey)}`,{
        ...config, validateStatus: status => [200,202,404,410].includes(status),
      });
    }
    this.assertAttachmentSession(session);
    if (!current()) throw new Error('Attachment screen changed. Reopen the original time entry.');
    return { status: response.status, data: response.data };
  }

  async writeTimeEntry<T>(entryId: string, action: 'correct' | 'approve', data?: any): Promise<T> {
    const revision = this.authRevision;
    const token = this.token || await this.getToken();
    const assertSession = () => {
      if (!token || token !== this.token || revision !== this.authRevision) throw new Error('Account changed. Reopen the timesheet.');
    };
    assertSession();
    if (!await checkOnlineStatus()) throw new Error('Connect to the internet to change or approve a time entry.');
    assertSession();
    const config = { expectedAuthToken: token, expectedAuthRevision: revision } as EvidenceConfig;
    const url = `/workforce-operations/time-entries/${encodeURIComponent(entryId)}`;
    const response = action === 'approve'
      ? await this.client.post<T>(url + '/approve', {}, config)
      : await this.client.patch<T>(url, data, config);
    assertSession();
    return response.data;
  }

  async patch<T>(url: string, data?: any): Promise<T> {
    const online = getOnlineStatus();
    if (!online) {

      await queueAction({ method: 'PATCH', url, data });
      throw new Error('Offline – action queued for later');
    }

    const response = await this.client.patch<T>(url, data);

    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const online = getOnlineStatus();
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
    fileInfo?: { name: string; mimeType?: string },
    expectedToken?: string | null,
    expectedOwner?: string
  ): Promise<T> {
    if (isEvidenceUpload(url)) return this.uploadEvidence<T>(url,fileUri,extraFields,fieldName,replay,fileInfo,expectedToken,expectedOwner);
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

  private async uploadEvidence<T>(url:string,fileUri:string,extraFields:Record<string,string>,fieldName:string,replay:boolean,fileInfo?:{name:string;mimeType?:string},expectedToken?:string|null,expectedOwner?:string):Promise<T> {
    // Capture auth and immutable metadata before the first await, including network/storage checks.
    const revision=this.authRevision;
    const initialToken=this.token;
    const fields=Object.freeze({...extraFields});
    const info=fileInfo?Object.freeze({...fileInfo}):undefined;
    if(!validEvidenceKey(fields.requestKey))throw new Error('A stable upload request key is required. Reopen the camera.');
    const token=expectedToken === undefined ? (initialToken || await this.getToken()) : expectedToken;
    const assertSession=()=>{if(!token||this.token!==token||this.authRevision!==revision)throw evidenceError('EVIDENCE_ACCOUNT_CHANGED','Account changed. Reopen the saved capture in its original account.');};
    assertSession();
    const raw=await SecureStore.getItemAsync('userData');
    assertSession();
    const owner=raw?String(JSON.parse(raw)?.id||''):'';
    if(!owner||(expectedOwner&&owner!==expectedOwner))throw evidenceError('EVIDENCE_ACCOUNT_CHANGED','Account changed. Reopen the saved capture in its original account.');
    const flightKey=`${owner}:${fields.requestKey}`;
    const inFlight=this.evidenceInFlight.get(flightKey);
    if(inFlight)return inFlight;
    const task=(async()=>{
      // The persisted original, not mutable screen state, is authoritative on every retry.
      const online=await checkOnlineStatus();
      assertSession();
      const config:EvidenceConfig={expectedAuthToken:token!};
      const completed=(response:any)=>response.status===200&&response.data?.success===true&&response.data?.requestKey===fields.requestKey&&typeof response.data?.photoId==='string'&&response.data.photoId.length>0;
      let uploadAllowed=false;
      if(online){
      let status;
      try { status=await this.client.get(`/photos/upload-status/${encodeURIComponent(fields.requestKey)}`,config); }
      catch(error:any){
        assertSession();
        if(error.response?.status===404&&error.response.data?.code==='EVIDENCE_REQUEST_NOT_FOUND'&&error.response.data?.requestKey===fields.requestKey)status=error.response;
        else if(error.response?.status===401||error.response?.status===403)throw error;
        // Retain a new capture before reporting a transient or ambiguous status failure.
      }
      assertSession();
      if(status&&completed(status)){
        await completeQueuedEvidence(fields.requestKey,owner);
        assertSession();
        return status.data as T;
      }
      // A generic 404 (including an older server without receipts) is NOT upload permission.
      uploadAllowed=status?.status===404&&status.data?.code==='EVIDENCE_REQUEST_NOT_FOUND'&&status.data?.requestKey===fields.requestKey;
      }
      let saved=await getPendingEvidence(owner,undefined,fields.requestKey);
      assertSession();
      if(!saved){
        if(replay)throw new Error('The saved capture is unavailable. Reopen offline sync.');
        if(!FileSystem.documentDirectory)throw new Error('Local storage is unavailable. Your capture has not been sent.');
        const metadata=uploadMetadata(fileUri,fieldName,info);
        const extension=/\.([a-z0-9]+)$/i.exec(metadata.name)?.[1] || 'bin';
        const permanentUri=FileSystem.documentDirectory+`${fields.requestKey}.${extension}`;
        await FileSystem.copyAsync({from:fileUri,to:permanentUri});
        assertSession();
        await queueAction({method:'POST',url,data:fields,fileUri:permanentUri,fieldName,fileInfo:{name:metadata.name,mimeType:metadata.type}},owner);
        saved=await getPendingEvidence(owner,undefined,fields.requestKey);
      }
      assertSession();
      if(!saved?.fileUri)throw new Error('The saved capture is unavailable. Nothing was sent.');
      if(!online)throw evidenceError('EVIDENCE_QUEUED','Offline – upload queued for later');
      if(!uploadAllowed)throw pendingEvidence();
      const formData=new FormData();
      const metadata=uploadMetadata(saved.fileUri,saved.fieldName||fieldName,saved.fileInfo);
      formData.append(saved.fieldName||fieldName,{uri:saved.fileUri,name:metadata.name,type:metadata.type} as any);
      Object.entries(saved.data as Record<string,string>).forEach(([key,value])=>formData.append(key,value));
      let response;
      try {
        response=await this.client.post<T>(url,formData,{...config,timeout:25*60*1000,headers:{'Content-Type':'multipart/form-data'}} as EvidenceConfig);
      }catch(error:any){
        assertSession();
        if(error.response?.status===401||error.response?.status===403)throw error;
        throw pendingEvidence();
      }
      assertSession();
      if(!completed(response))throw pendingEvidence();
      await completeQueuedEvidence(fields.requestKey,owner);
      assertSession();
      return response.data;
    })();
    this.evidenceInFlight.set(flightKey,task);
    try{return await task;}finally{if(this.evidenceInFlight.get(flightKey)===task)this.evidenceInFlight.delete(flightKey);}
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
