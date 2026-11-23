'use strict';

const PROFILE = 'private-device-test';
const LIVE = new Set([
  'future-jobs-pro-ai-production.up.railway.app',
  'futurejobsproai.com',
  'www.futurejobsproai.com',
  'future-jobs-pro-ai.vercel.app',
  'future-jobs-pro-ai-z32m.vercel.app',
]);

// The match is an exact /api URL with no query, port, escaping or credentials.
// A match is a config constraint, not network/ownership verification.
function normalizeApi(raw) {
  if (typeof raw !== 'string' ||
      !/^https:\/\/[a-z0-9.-]+\/api\/?$/.test(raw) ||
      raw !== raw.trim()) return null;
  const host = raw.slice(8).split('/')[0];
  if (host.length > 253 || /^[\d.]+$/.test(host) ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host) ||
      LIVE.has(host) || /(?:^|\.)(?:localhost|local|internal)$/.test(host)) return null;
  try { return 'https://' + new URL(raw).hostname + '/api'; }
  catch { return null; }
}

function assertPrivateBuild(env) {
  const byProfile = env.EAS_BUILD_PROFILE === PROFILE;
  const byMarker = env.EXPO_PUBLIC_FJ_PRIVATE_TEST === '1';
  if (!byProfile && !byMarker) return;
  if (!byMarker || (env.EAS_BUILD_PROFILE && !byProfile) || env.EXPO_NO_DOTENV !== '1') {
    throw new Error('Private device test profile flags are missing or inconsistent.');
  }
  const api = normalizeApi(env.EXPO_PUBLIC_API_URL);
  const reviewed = normalizeApi(env.FJ_REVIEWED_PRIVATE_API_URL);
  if (!api || !reviewed || api !== reviewed) {
    throw new Error('Private device test needs an explicit API matching its reviewed test target.');
  }
}

module.exports = { assertPrivateBuild };
if (require.main === module) {
  try { assertPrivateBuild(process.env); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
