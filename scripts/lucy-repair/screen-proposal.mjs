import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validatePatch } from './policy.mjs';

// Fail closed, without including matched content in errors or logs.
export function screenProposal(raw, scope, secrets) {
  if (!secrets.length || secrets.some(value => typeof value !== 'string' || value.length < 16)) {
    throw new Error('Credential screening is not configured');
  }
  const patch = validatePatch(raw, scope, { allowEmpty: true });
  const text = [raw, ...patch.files.map(file => file.content)].join('\n');
  for (const secret of secrets) {
    const forms = [secret, Buffer.from(secret).toString('base64'), Buffer.from(secret).toString('hex'), encodeURIComponent(secret)];
    if (forms.some(value => text.includes(value))) throw new Error('Proposal rejected: credential material');
  }
  // Also reject provider token formats and masked output: never publish a
  // proposal whose content was already redacted by a provider or runner.
  if (/\*\*\*|\b(?:github_pat_|gh[pousr]_|sk-(?:proj-|svcacct-)?)[A-Za-z0-9_-]{16,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) {
    throw new Error('Proposal rejected: possible credential or redaction');
  }
  return patch;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input='/tmp/lucy-proposal.json';
  if (!fs.lstatSync(input).isFile() || fs.statSync(input).size > 250000) throw new Error('Invalid proposal file');
  const patch=screenProposal(fs.readFileSync(input,'utf8'),process.env.REPAIR_SCOPE,[process.env.SCAN_OPENAI_KEY,process.env.SCAN_GITHUB_TOKEN]);
  fs.writeFileSync('/tmp/lucy-screened-proposal.json',JSON.stringify(patch),{mode:0o600});
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_patch=${patch.files.length > 0}\n`);
  console.log(`Credential screening and path validation passed for ${patch.files.length} files`);
}
