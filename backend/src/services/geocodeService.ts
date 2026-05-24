// ============================================
// GEOCODE SERVICE (Reverse GPS → Address)
// Future Jobs Pro AI – Created by Samuel B.
// ============================================

interface NominatimResponse {
  display_name?: string;
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      { headers: { 'User-Agent': 'FutureJobsProAI/1.0 (Samuel B.)' } }
    );
    const data = (await res.json()) as NominatimResponse;
    if (data && data.display_name) {
      return data.display_name;
    }
  } catch (err) {
    console.warn('Geocode failed:', err);
  }
  return undefined;
}