const { spawnSync } = require('node:child_process');
const path = require('node:path');
const steps = ['run-project-archive-migration.cjs', 'run-attachment-schema-migration.cjs', 'run-task-evidence-migration.cjs', 'run-evidence-receipts-migration.cjs', 'migrate-chat-media.cjs', 'migrate-chat-text-requests.cjs', 'runVoiceNoteMigration.js', 'run-owner-operations-migration.js', 'run-email-verification-migration.cjs', 'run-lucy-workspace-migration.cjs'];
function run(runner = spawnSync) {
  for (const step of steps) {
    console.log(`Release migration: ${step}`);
    const result = runner(process.execPath, [path.join(__dirname, step)], { stdio: 'inherit', shell: false });
    if (result.error || result.status !== 0) throw new Error(`Release migration failed: ${step}`);
  }
  console.log('All release migrations completed.');
}
if (require.main === module) {
  try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { run, steps };
