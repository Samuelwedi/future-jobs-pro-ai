const API_BASE = 'https://futurejobsproai.com';

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// Global handler for 402 Payment Required
const handle402 = () => {
  // Prevent multiple redirects
  if (window.location.pathname === '/payment-required') return;
  window.location.href = '/payment-required';
};

export const api = {
  async get(path: string) {
    const res = await fetch(`${API_BASE}${path}`, { headers: getHeaders() });
    if (res.status === 402) handle402();
    return res.json();
  },
  async post(path: string, body: any) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    if (res.status === 402) handle402();
    return res.json();
  },
  async uploadFileWithData<T>(path: string, fileUri: string, extraFields: Record<string, string>, fileFieldName = 'photo'): Promise<T> {
    const formData = new FormData();
    formData.append(fileFieldName, { uri: fileUri, type: 'image/jpeg', name: 'photo.jpg' } as any);
    Object.entries(extraFields).forEach(([key, value]) => formData.append(key, value));
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      body: formData,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status === 402) handle402();
    return res.json();
  },
  async getAISuggestions(): Promise<{ suggestions: any[] }> {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    return this.get(`/api/ai/suggestions/${user.id}`);
  },
  async dismissSuggestion(id: string) {
    return this.post(`/api/ai/suggestions/${id}/dismiss`, {});
  },
  async recordAIEvent(event: string, metadata: any, location?: { lat: number; lng: number }) {
    return this.post('/api/ai/events', { event, metadata, location });
  },
};