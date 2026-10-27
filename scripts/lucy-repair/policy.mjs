import fs from 'node:fs';
import path from 'node:path';
export const allowed = {
  'mobile-audio': [
    'mobile/src/services/RecorderSession.ts', 'mobile/src/hooks/useRecorderSession.ts',
    'mobile/src/screens/AIAssistantScreen.tsx', 'mobile/src/screens/VoiceNoteScreen.tsx',
    'mobile/tests/lucy-repair.test.cjs',
  ],
  'support-portal': ['webdash/src/LiveMonitoring.js', 'webdash/src/App.css', 'webdash/src/LiveMonitoring.repair.test.js'],
};
// All application source is eligible for diagnosis and a bounded repair.
// Release controls, credentials, dependencies and existing tests are not writable.
export const roots = {
  backend: ['backend/src/'], 'customer-web': ['web/src/'],
  mobile: ['mobile/src/', 'mobile/modules/'], 'portal-app': ['webdash/src/'],
  application: ['backend/src/', 'web/src/', 'webdash/src/', 'mobile/src/', 'mobile/modules/'],
};
export const regressionPaths = {
  backend: 'backend/tests/lucy-repair.test.cjs',
  'customer-web': 'web/tests/lucy-repair.test.cjs',
  mobile: 'mobile/tests/lucy-repair.test.cjs',
  'portal-app': 'webdash/src/LiveMonitoring.repair.test.js',
  application: 'backend/tests/lucy-repair.test.cjs',
};
export const scopes = [...Object.keys(allowed), ...Object.keys(roots)];
const controlPlane = /(?:ownerRepair|ownerOperations|systemReliability|lucyReliability|supportAgentRoutes)/i;
export function pathAllowed(file, scope) {
  if (typeof file !== 'string' || file.includes('\\') || file.split('/').some(p=>!p || p==='.' || p==='..') || /(?:^|\/)\./.test(file)) return false;
  if (allowed[scope]) return allowed[scope].includes(file);
  if (!roots[scope]) return false;
  if (file === regressionPaths[scope]) return true;
  return roots[scope].some(root=>file.startsWith(root)) && /\.(?:tsx?|jsx?|css|json|kt|java|swift|m|mm|h)$/.test(file)
    && !/(?:^|\/)(?:node_modules|tests?|__tests__|__mocks__)(?:\/|$)|\.(?:test|spec)\./i.test(file)
    && !/(?:secret|credential|\.env|service.account)/i.test(file) && !controlPlane.test(file);
}
// Broad or security-sensitive changes are published for owner review, not
// silently promoted through the narrow, previously verified auto-deploy path.
export function requiresReview(patch, scope) {
  // The automatic publisher targets the support portal project only. Customer
  // website changes need their own release target and must stay review candidates.
  if (scope === 'application' || scope === 'backend' || scope === 'customer-web') return true;
  return patch.files.some(f=>/(?:auth|login|sign.?in|permission|tenant|company|payroll|paystub|payment|payout|billing|stripe|quickbook|subscription|tax|bank|token|secure|\/modules\/|(?:^|\/)App\.[jt]sx?$)/i.test(f.path)
    || /(?:Authorization|Bearer |localStorage|sessionStorage|jwt|access_token|refresh_token|company_id|tenant_id)/i.test(f.content));
}
export function validatePatch(raw, scope, { allowEmpty = false } = {}) {
  if (!scopes.includes(scope)) throw new Error('Unsupported repair scope');
  if (Buffer.byteLength(raw) > 250000) throw new Error('Repair exceeds size limit');
  const patch = JSON.parse(raw);
  if (!patch || !Array.isArray(patch.files) || patch.files.length < (allowEmpty ? 0 : 1) || patch.files.length > 5) throw new Error('Expected 1–5 replacement files');
  const seen = new Set();
  for (const file of patch.files) {
    if (!pathAllowed(file.path, scope) || seen.has(file.path)) throw new Error('Repair touches an unapproved or repeated path');
    if (typeof file.content !== 'string' || Buffer.byteLength(file.content) > 100000 || file.content.includes('\0')) throw new Error('Invalid replacement file');
    seen.add(file.path);
  }
  if (patch.files.length && roots[scope] && !seen.has(regressionPaths[scope])) throw new Error('Expanded repairs require a regression test');
  return patch;
}
export function applyPatch(patch, root = process.cwd()) {
  for (const file of patch.files) {
    const full = path.join(root, file.path);
    for (let parent = full; parent !== root; parent = path.dirname(parent)) {
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error('Symbolic links are not allowed');
    }
    if (/lucy-repair\.test\.cjs$|LiveMonitoring\.repair\.test\.js$/.test(file.path) && fs.existsSync(full) && !file.content.startsWith(fs.readFileSync(full, 'utf8'))) throw new Error('Existing regression tests must be preserved; append new tests');
    fs.mkdirSync(path.dirname(full), {recursive:true});
    fs.writeFileSync(full, file.content, { mode: 0o644 });
  }
}
