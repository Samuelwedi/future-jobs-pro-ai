import { pool } from '../config/database';
import fetch from 'node-fetch'; // or use axios

/**
 * Reverse geocode to get city name from coordinates using Nominatim.
 */
export async function getCityFromCoords(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`;
    const response = await fetch(url);
    const data: any = await response.json();
    if (data && data.address) {
      // Try to get city, town, village, or county
      return data.address.city || data.address.town || data.address.village || data.address.county || null;
    }
    return null;
  } catch (e) {
    console.error('Reverse geocoding error:', e);
    return null;
  }
}

/**
 * Update company's office city if not set.
 */
export async function setCompanyOfficeFromClockIn(
  userId: string,
  latitude: number,
  longitude: number
): Promise<void> {
  const userRes = await pool.query('SELECT company_id FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) return;
  const companyId = userRes.rows[0].company_id;
  if (!companyId) return;

  const compRes = await pool.query(
    'SELECT office_city FROM companies WHERE id = $1',
    [companyId]
  );
  if (compRes.rows.length === 0) return;
  if (compRes.rows[0].office_city) {
    // Already set – nothing to do
    return;
  }

  const city = await getCityFromCoords(latitude, longitude);
  if (city) {
    await pool.query('UPDATE companies SET office_city = $1 WHERE id = $2', [city, companyId]);
    console.log(`🏢 Office city set for company ${companyId} to: ${city}`);
  }
}

/**
 * Retroactively compute office city for a company (or all companies) from existing clock-ins.
 * For each company, we find the most common city among its users' clock-in locations.
 */
export async function computeOfficeCity(companyId?: string): Promise<void> {
  let query = `
    SELECT 
      c.id AS company_id,
      te.latitude,
      te.longitude
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    JOIN companies c ON u.company_id = c.id
    WHERE te.latitude IS NOT NULL AND te.longitude IS NOT NULL
  `;
  const params: any[] = [];
  if (companyId) {
    query += ' AND u.company_id = $1';
    params.push(companyId);
  }
  query += ' ORDER BY te.created_at DESC';

  const result = await pool.query(query, params);
  const companyMap: Record<string, { lat: number; lng: number }[]> = {};

  for (const row of result.rows) {
    if (!companyMap[row.company_id]) companyMap[row.company_id] = [];
    companyMap[row.company_id].push({ lat: row.latitude, lng: row.longitude });
  }

  for (const [companyId, points] of Object.entries(companyMap)) {
    if (points.length === 0) continue;
    // Use the most recent point (or average) – we'll use the first (most recent) point.
    const latest = points[0];
    const city = await getCityFromCoords(latest.lat, latest.lng);
    if (city) {
      await pool.query('UPDATE companies SET office_city = $1 WHERE id = $2', [city, companyId]);
      console.log(`🏢 City computed for company ${companyId}: ${city}`);
    }
  }
}