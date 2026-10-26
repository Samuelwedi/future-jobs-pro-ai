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
export function validatePatch(raw, scope, { allowEmpty = false } = {}) {
  if (!allowed[scope]) throw new Error('Unsupported repair scope');
  if (Buffer.byteLength(raw) > 250000) throw new Error('Repair exceeds size limit');
  const patch = JSON.parse(raw);
  if (!patch || !Array.isArray(patch.files) || patch.files.length < (allowEmpty ? 0 : 1) || patch.files.length > 5) throw new Error('Expected 1–5 replacement files');
  const seen = new Set();
  for (const file of patch.files) {
    if (!allowed[scope].includes(file.path) || seen.has(file.path)) throw new Error('Repair touches an unapproved or repeated path');
    if (typeof file.content !== 'string' || Buffer.byteLength(file.content) > 100000 || file.content.includes('\0')) throw new Error('Invalid replacement file');
    seen.add(file.path);
  }
  return patch;
}
export function applyPatch(patch, root = process.cwd()) {
  for (const file of patch.files) {
    const full = path.join(root, file.path);
    for (let parent = full; parent !== root; parent = path.dirname(parent)) {
      if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error('Symbolic links are not allowed');
    }
    fs.writeFileSync(full, file.content, { mode: 0o644 });
  }
}
