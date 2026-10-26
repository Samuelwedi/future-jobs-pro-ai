import fs from 'node:fs';
import { validatePatch, applyPatch } from './policy.mjs';
const raw = fs.readFileSync(process.env.REPAIR_PATCH_FILE, 'utf8');
const patch = validatePatch(raw, process.env.REPAIR_SCOPE);
applyPatch(patch);
fs.writeFileSync('/tmp/lucy-repair-patch.json', JSON.stringify(patch));
console.log(`Validated ${patch.files.length} files in ${process.env.REPAIR_SCOPE}`);
