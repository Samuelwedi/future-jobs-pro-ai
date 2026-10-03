const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const expectedAdvisory = 'https://github.com/advisories/GHSA-86w9-cpqp-85rv';
const expectedNames = ["@expo/cli", "@expo/code-signing-certificates", "@expo/metro", "@expo/metro-config", "@jest/environment", "@jest/fake-timers", "@jest/transform", "@react-native-community/cli", "@react-native-community/cli-clean", "@react-native-community/cli-config", "@react-native-community/cli-config-android", "@react-native-community/cli-config-apple", "@react-native-community/cli-doctor", "@react-native-community/cli-platform-android", "@react-native-community/cli-platform-apple", "@react-native-community/cli-platform-ios", "@react-native/community-cli-plugin", "babel-jest", "braces", "expo", "fast-glob", "jest-environment-node", "jest-haste-map", "jest-message-util", "metro", "metro-config", "metro-file-map", "metro-transform-worker", "micromatch", "node-forge", "react-native"];
const expectedPatchSha256 = '0d70cab39f12c462f4ff1e3f45eb9aa93b7c4620260ea4bf2d9cc7b08358be78';

function fail(message) {
  console.error(`Mobile dependency audit failed: ${message}`);
  process.exitCode = 1;
}

try {
  const report = JSON.parse(fs.readFileSync(0, 'utf8'));
  const findings = report.vulnerabilities || {};
  const names = Object.keys(findings).sort();
  if(JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw Error(`Unexpected affected packages: ${names.join(', ')}`);
  }
  const counts = report.metadata?.vulnerabilities;
  if(counts?.high !== 31 || counts?.total !== 31) throw Error('Unexpected severity or finding count');
  const allowed = new Map([
    ['node-forge', [expectedAdvisory, '<=1.4.0']],
    ['braces', ['https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', '<=3.0.3']]
  ]);
  for (const name of names) {
    const finding = findings[name];
    if(finding.severity !== 'high' || !Array.isArray(finding.via) || !finding.via.length) throw Error('Unexpected finding shape');
    for(const via of finding.via) {
      if(typeof via === 'string') {
        if(!findings[via]) throw Error('Unknown transitive dependency');
      } else {
        const expected = allowed.get(name);
        if(!expected || via.url !== expected[0] || via.range !== expected[1] || via.severity !== 'high') throw Error('Unreviewed advisory');
      }
    }
  }
  for(const [name] of allowed) {
    if(findings[name].via.length !== 1 || typeof findings[name].via[0] !== 'object') throw Error('Root advisory changed');
  }
  const reachesRoot = (name, seen = new Set()) => {
    if(allowed.has(name)) return true;
    if(seen.has(name)) return false;
    const next = new Set(seen); next.add(name);
    return findings[name].via.some(v => typeof v === 'string' && reachesRoot(v, next));
  };
  if(names.some(name => !reachesRoot(name))) throw Error('Unreviewed dependency chain');
  const root = path.resolve(__dirname, '..');
  const patch = fs.readFileSync(path.join(root, 'patches/node-forge+1.4.0.patch'));
  if(crypto.createHash('sha256').update(patch).digest('hex') !== expectedPatchSha256) {
    throw Error('The reviewed install-time patch changed');
  }
  const installed = fs.readFileSync(path.join(root, 'node_modules/node-forge/lib/rsa.js'), 'utf8');
  if(!installed.includes("obj.value[0].value.length !==\n            (('parameters' in capture) ? 2 : 1)")) {
    throw Error('The node-forge patch is not installed');
  }
  const bracesPatch = fs.readFileSync(path.join(root, 'patches/braces+3.0.3.patch'), 'utf8').replace(/\r\n/g, '\n');
  if(crypto.createHash('sha256').update(bracesPatch).digest('hex') !== '544e39aba70c08a5a8070bb4e734cdfb70be5afdb0d3ff4bfd1a60238ec04982') throw Error('Reviewed braces mitigation changed');
  require('node:child_process').execFileSync(process.execPath, ['--test', path.join(root, 'tests/braces-patch.test.cjs')], {stdio:'inherit'});
  console.log('Two reviewed advisories remain in registry metadata; installed local mitigations verified.');
} catch(error) {
  fail(error.message);
}
