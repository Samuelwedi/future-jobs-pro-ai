const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const expectedAdvisory = 'https://github.com/advisories/GHSA-86w9-cpqp-85rv';
const expectedNames = ['@expo/cli', '@expo/code-signing-certificates', 'expo', 'node-forge'];
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
  if(counts?.high !== 4 || counts?.total !== 4) {
    throw Error('Unexpected severity or finding count');
  }
  const direct = findings['node-forge'];
  if(direct?.severity !== 'high' || direct.via?.length !== 1 ||
      direct.via[0]?.url !== expectedAdvisory || direct.via[0]?.range !== '<=1.4.0') {
    throw Error('The node-forge advisory differs from the reviewed finding');
  }
  if(names.some(name => findings[name].severity !== 'high') ||
      findings['@expo/cli'].via.some(v => !['@expo/code-signing-certificates', 'node-forge'].includes(v)) ||
      findings['@expo/code-signing-certificates'].via.some(v => v !== 'node-forge') ||
      findings.expo.via.some(v => v !== '@expo/cli')) {
    throw Error('The transitive advisory paths differ from the reviewed dependency chain');
  }
  const root = path.resolve(__dirname, '..');
  const patch = fs.readFileSync(path.join(root, 'patches/node-forge+1.4.0.patch'));
  if(crypto.createHash('sha256').update(patch).digest('hex') !== expectedPatchSha256) {
    throw Error('The reviewed install-time patch changed');
  }
  const installed = fs.readFileSync(path.join(root, 'node_modules/node-forge/lib/rsa.js'), 'utf8');
  if(!installed.includes("obj.value[0].value.length !==\n            (('parameters' in capture) ? 2 : 1)")) {
    throw Error('The node-forge patch is not installed');
  }
  console.log('Reviewed node-forge advisory remains in published metadata; installed patch verified.');
} catch(error) {
  fail(error.message);
}
