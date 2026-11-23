'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const { assertPrivateBuild } = require('../scripts/private-build-fence.cjs');

const fake = 'https://future-preview.example.com/api';
const profile = require('../eas.json').build['private-device-test'];
const privateEnv = {
  EAS_BUILD_PROFILE: 'private-device-test', ...profile.env,
  EXPO_PUBLIC_API_URL: fake, FJ_REVIEWED_PRIVATE_API_URL: fake,
};
const guard = match => assert.throws(() => assertPrivateBuild({...privateEnv, ...match}), /^Error: Private device test/);

test('private store-capable profile declares preview, never inherits another profile or auto-submits', () => {
  assert.equal(profile.environment, 'preview');
  assert.equal(profile.distribution, 'store');
  assert.equal(profile.android.buildType, 'app-bundle');
  assert(!profile.ios.simulator && !profile.extends && !profile.channel);
  assert(!require('../eas.json').submit['private-device-test']);
  assert.equal(require('../package.json').scripts['eas-build-pre-install'], 'node scripts/private-build-fence.cjs');
});

test('normal flows may resolve unchanged and private config works before a server profile name is present', () => {
  assert.doesNotThrow(() => assertPrivateBuild({}));
  assert.doesNotThrow(() => assertPrivateBuild({EAS_BUILD_PROFILE: 'production'}));
  assert.doesNotThrow(() => assertPrivateBuild({...privateEnv, EAS_BUILD_PROFILE: undefined, EXPO_PUBLIC_API_URL: fake + '/'}));
});

test('profile must carry the expected marker with dotenv disabled on both systems', () => {
  guard({EXPO_PUBLIC_FJ_PRIVATE_TEST: undefined});
  guard({EXPO_NO_DOTENV: undefined});
  guard({EAS_BUILD_PROFILE: 'production'});
  for (const platform of ['android', 'ios']) {
    assert.doesNotThrow(() => assertPrivateBuild({...privateEnv, EAS_BUILD_PLATFORM: platform}));
  }
});

test('matching explicit independently reviewed target required, never fallback', () => {
  guard({EXPO_PUBLIC_API_URL: undefined});
  guard({FJ_REVIEWED_PRIVATE_API_URL: undefined});
  guard({FJ_REVIEWED_PRIVATE_API_URL: 'https://different.example.com/api'});
});

for (const raw of [
  'https://future-jobs-pro-ai-production.up.railway.app/api',
  'https://futurejobsproai.com/api',
  'https://www.futurejobsproai.com/api',
  'https://future-jobs-pro-ai.vercel.app/api',
  'https://future-jobs-pro-ai-z32m.vercel.app/api',
  'https://futurejobsproai.com./api',
  'https://foo.localhost/api',
  'https://foo.local/api',
  'https://web.internal/api',
  'https://127.0.0.1/api', 'https://0x7f.0x00.0x00.0x01/api',
  'https://[::1]/api', 'https://example.com:443/api', 'http://example.com/api',
  'https://user@example.com/api', 'https://example.com/api#test',
  'https://example.com/api?token=secret', 'https://example.com/api\n',
  'https://x-.example.com/api', 'https://x..example.com/api',
  'https://example.com/%61pi', 'https://example.com/api/private',
]) {
  test('reject unsafe API fixture #' + (String(raw).length) + ' (' + raw.replace(/[^\w./:\[\]@-]/g, '_').split('?')[0].replace(/token_secret/, 'redacted') + ')', () => {
    guard({EXPO_PUBLIC_API_URL: raw, FJ_REVIEWED_PRIVATE_API_URL: raw});
  });
}

test('real pre-install CLI stops before dependency installation without disclosing the supplied URL', () => {
  const p = resolve(__dirname, '../scripts/private-build-fence.cjs');
  const bad = spawnSync(process.execPath, [p], {env: {...privateEnv, FJ_REVIEWED_PRIVATE_API_URL: undefined}, encoding: 'utf8'});
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /matching its reviewed test target/);
  assert(!bad.stderr.includes(fake));
  const good = spawnSync(process.execPath, [p], {env: privateEnv, encoding: 'utf8'});
  assert.equal(good.status, 0);
  assert.equal(good.stdout, '');
});

test('API module initialization uses explicit private input or stops before defining the live client', () => {
  const src = readFileSync(resolve(__dirname, '../src/services/api.ts'), 'utf8');
  const block = src.slice(src.indexOf('const DEV_API_URL'), src.indexOf('class ApiService')).replace('export const API_URL', 'const API_URL');
  const run = (env, dev = false) => vm.runInNewContext(block + '\nAPI_URL', {process: {env}, __DEV__: dev});
  assert.equal(run(privateEnv), fake);
  assert.throws(() => run({...privateEnv, EXPO_PUBLIC_API_URL: ''}), /requires an explicit API URL/);
  assert.equal(run({}), 'https://future-jobs-pro-ai-production.up.railway.app/api');
  assert.equal(run({EXPO_PUBLIC_API_URL: fake + '/'}, true), fake);
});
