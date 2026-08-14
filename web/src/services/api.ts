const configuredBase = (import.meta.env as any).VITE_API_URL || (import.meta.env as any).VITE_API_BASE;

export const API_BASE = String(
  configuredBase || 'https://future-jobs-pro-ai-production.up.railway.app',
).replace(/\/$/, '');

export const WS_URL = API_BASE;

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const getHeaders = (json = true): Record<string, string> => {
  const token = localStorage.getItem('token');
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const handleSessionStatus = (status: number) => {
  if (status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (window.location.pathname !== '/login') window.location.assign('/login');
  }
  if (status === 402 && window.location.pathname !== '/payment-required') {
    window.location.assign('/payment-required');
  }
};

async function parseResponse<T>(response: Response): Promise<T> {
  handleSessionStatus(response.status);
  const contentType = response.headers.get('content-type') || '';
  const body: any = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');
  if (!response.ok) {
    const message = body?.message || body?.error || `Request failed with status ${response.status}`;
    throw new ApiError(String(message), response.status, body);
  }
  return body as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...getHeaders(init.body !== undefined), ...(init.headers || {}) },
  });
  return parseResponse<T>(response);
}

export const api = {
  get<T = any>(path: string, options: RequestInit = {}) {
    return request<T>(path, { ...options, method: 'GET', headers: getHeaders(false) });
  },
  post<T = any>(path: string, body?: unknown) {
    return request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  },
  put<T = any>(path: string, body?: unknown) {
    return request<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) });
  },
  patch<T = any>(path: string, body?: unknown) {
    return request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
  },
  delete<T = any>(path: string) {
    return request<T>(path, { method: 'DELETE', headers: getHeaders(false) });
  },
  async upload<T = any>(path: string, formData: FormData): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      body: formData,
      headers: getHeaders(false),
    });
    return parseResponse<T>(response);
  },
  async download(path: string): Promise<Blob> {
    const response = await fetch(`${API_BASE}${path}`, { headers: getHeaders(false) });
    handleSessionStatus(response.status);
    if (!response.ok) throw new ApiError(`Download failed with status ${response.status}`, response.status);
    return response.blob();
  },
  async uploadFileWithData<T>(
    path: string,
    file: File | string,
    extraFields: Record<string, string>,
    fileFieldName = 'file',
  ): Promise<T> {
    const formData = new FormData();
    if (file instanceof File) formData.append(fileFieldName, file);
    else throw new Error('Browser uploads require a File object');
    Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));
    return this.upload<T>(path, formData);
  },
  async getAISuggestions(): Promise<{ suggestions: any[] }> {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return this.get(`/api/ai/suggestions/${encodeURIComponent(user.id || '')}`);
  },
  dismissSuggestion(id: string) {
    return this.post(`/api/ai/suggestions/${encodeURIComponent(id)}/dismiss`, {});
  },
  recordAIEvent(event: string, metadata: any, location?: { lat: number; lng: number }) {
    return this.post('/api/ai/events', { event, metadata, location });
  },
};
