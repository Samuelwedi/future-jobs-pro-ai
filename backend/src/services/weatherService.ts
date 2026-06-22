import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'fs';

// ============================================================
// WEATHERKIT SERVICE – Apple WeatherKit API
// ============================================================

const TEAM_ID = process.env.APPLE_TEAM_ID!;          // AX48GNLAH7
const KEY_ID = process.env.APPLE_KEY_ID!;            // 7D993MPDBC
const SERVICE_ID = process.env.WEATHERKIT_SERVICE_ID!; // e.g., com.futurejobsproai.weather
const PRIVATE_KEY = process.env.APPLE_PRIVATE_KEY!;   // Can be base64 or path

function getPrivateKey(): string {
  // If the env var contains a path, read the file
  if (process.env.APPLE_PRIVATE_KEY_PATH) {
    return fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, 'utf8');
  }
  // Otherwise assume it's the raw key (base64 encoded to preserve newlines)
  return Buffer.from(PRIVATE_KEY, 'base64').toString('utf8');
}

function generateWeatherToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: TEAM_ID,
    iat: now,
    exp: now + 600, // 10 minutes expiry
    sub: SERVICE_ID,
  };
  const privateKey = getPrivateKey();
  return jwt.sign(payload, privateKey, {
    algorithm: 'ES256',
    header: { kid: KEY_ID, alg: 'ES256' },
  });
}

export async function getWeather(
  lat: number,
  lng: number,
  date: Date = new Date()
): Promise<string> {
  try {
    const token = generateWeatherToken();
    const url = `https://weatherkit.apple.com/api/v1/weather/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}?countryCode=US&timezone=UTC&dataSets=currentWeather`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
    const current = response.data?.currentWeather;
    if (!current) return 'Weather unavailable';
    const temp = Math.round(current.temperature);
    // Condition codes: e.g., "Cloudy", "Rain", "Sunny" – replace underscores
    const condition = (current.conditionCode || 'Unknown').replace(/_/g, ' ');
    return `${condition} ${temp}°C`;
  } catch (error: any) {
    console.warn('⚠️ WeatherKit error:', error.message);
    return 'Weather unavailable';
  }
}