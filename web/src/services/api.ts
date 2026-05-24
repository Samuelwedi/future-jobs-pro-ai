const API_BASE = 'https://balancing-treble-prevent.ngrok-free.dev';

export const api = {
  async post(path: string, body: any) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.json();
  },
};