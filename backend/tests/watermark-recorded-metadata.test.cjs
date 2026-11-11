const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');
const cp = require('node:child_process');
process.env.TS_NODE_PROJECT = path.join(__dirname, '../tsconfig.json');
require('ts-node/register/transpile-only');
const originalExec = cp.execFile;
const originalFetch = global.fetch;
let text, requests = [];
function fakeExec() {}
fakeExec[util.promisify.custom] = async (command, args) => {
  if (command === 'ffprobe') return { stdout: '640,480' };
  assert.equal(command, 'ffmpeg');
  text = fs.readFileSync(args[1] + '.text.txt', 'utf8');
  fs.writeFileSync(args[args.length - 2], Buffer.alloc(6000));
  return { stdout: '' };
};
cp.execFile = fakeExec;
const { applyWatermark } = require('../src/services/watermarkService');
cp.execFile = originalExec;
global.fetch = async url => {
  requests.push(String(url));
  if (String(url).startsWith('https://api.openweathermap.org/data/2.5/weather?')) {
    return { ok: true, json: async () => ({ main: { temp: 10 }, weather: [{ description: 'clear' }] }) };
  }
  assert.ok(String(url).startsWith('https://nominatim.openstreetmap.org/reverse?'));
  return { ok: true, json: async () => ({ display_name: 'Fixture site' }) };
};
after(() => { global.fetch = originalFetch; });
async function render(coordinates, extra = {}) {
  requests = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recorded-metadata-'));
  try {
    const input = path.join(dir, 'input.mov');
    fs.writeFileSync(input, Buffer.alloc(6000));
    const result = await applyWatermark(input, path.join(dir, 'output.mp4'), {
      takenAt: new Date('2026-11-11T12:00:00Z'), address: 'Fixture site',
      weather: 'Not available', ...coordinates, ...extra,
    });
    assert.equal(result.applied, true);
    assert.ok(!fs.existsSync(input + '.text.txt'));
    return { ...result, text, requests: [...requests] };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('zero latitude and longitude are retained, including the origin and coordinate limits', async () => {
  for (const [latitude, longitude, expected] of [
    [0, -73, '0.000000°N, 73.000000°W'], [45, 0, '45.000000°N, 0.000000°E'],
    [0, 0, '0.000000°N, 0.000000°E'], [-90, 180, '90.000000°S, 180.000000°E'],
  ]) {
    const result = await render({ latitude, longitude });
    assert.ok(result.text.includes('Recorded GPS: ' + expected));
    assert.ok(result.text.includes('Metadata checksum: ' + result.verificationHash));
    assert.doesNotMatch(result.text, /Verified:/);
    assert.deepEqual(result.requests, []);
  }
});
test('missing, nonnumeric, nonfinite and out-of-range coordinates are not displayed or geocoded', async () => {
  for (const coordinates of [{}, { latitude: 0 }, { latitude: null, longitude: 0 },
    { latitude: '0', longitude: 0 }, { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity }, { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 }]) {
    const result = await render(coordinates, { address: undefined });
    assert.doesNotMatch(result.text, /Recorded GPS:/);
    assert.deepEqual(result.requests, []);
  }
});
test('valid zero coordinates use the existing geocoder when no address was recorded', async () => {
  const result = await render({ latitude: 0, longitude: 0 }, { address: undefined });
  assert.equal(result.requests.length, 1);
  assert.match(result.requests[0], /lat=0&lon=0/);
  assert.match(result.text, /Fixture site/);
});
test('missing coordinates do not share the origin checksum; identical metadata stays deterministic', async () => {
  const absent = await render({});
  const origin = await render({ latitude: 0, longitude: 0 });
  assert.notEqual(absent.verificationHash, origin.verificationHash);
  assert.equal(origin.verificationHash, (await render({ latitude: 0, longitude: 0 })).verificationHash);
});

test('weather lookup includes valid zero coordinates and skips invalid pairs', async () => {
  const originalKey = process.env.OPENWEATHER_API_KEY;
  process.env.OPENWEATHER_API_KEY = 'isolated-test-placeholder';
  try {
    const valid = await render({ latitude: 0, longitude: 0 }, { weather: undefined });
    assert.equal(valid.requests.length, 1);
    assert.match(valid.requests[0], /weather\?lat=0&lon=0/);
    assert.match(valid.text, /Weather: Clear 10°C/);
    for (const coordinates of [{}, { latitude: 0, longitude: NaN }]) {
      const invalid = await render(coordinates, { weather: undefined });
      assert.deepEqual(invalid.requests, []);
      assert.match(invalid.text, /Weather: Not available/);
    }
  } finally {
    if (originalKey === undefined) delete process.env.OPENWEATHER_API_KEY;
    else process.env.OPENWEATHER_API_KEY = originalKey;
  }
});
