const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const backend = path.join(__dirname, '..');

// Stage production paths, transpiling current source instead of trusting dist.
test('final Docker image packages the font and license used by timesheet PDF exports', async () => {
  const dockerfile = fs.readFileSync(path.join(backend, '../Dockerfile'), 'utf8');
  const finalStage = dockerfile.split(/^FROM /m).at(-1);
  assert.match(finalStage, /^COPY --from=build \/app\/backend\/assets \.\/backend\/assets\s*$/m);
  assert.match(finalStage, /^COPY --from=build \/app\/backend\/dist \.\/backend\/dist\s*$/m);
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'timesheet-image-'));
  try {
    const stagedBackend = path.join(staging, 'backend');
    fs.mkdirSync(path.join(stagedBackend, 'dist/services'), {recursive:true});
    fs.cpSync(path.join(backend, 'assets'), path.join(stagedBackend, 'assets'), {recursive:true});
    fs.symlinkSync(fs.realpathSync(path.join(backend, 'node_modules')), path.join(stagedBackend, 'node_modules'), 'dir');
    for (const service of ['timesheetExport', 'payPeriodCalendar']) {
      const source = fs.readFileSync(path.join(backend, `src/services/${service}.ts`), 'utf8');
      const {outputText} = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}});
      fs.writeFileSync(path.join(stagedBackend, `dist/services/${service}.js`), outputText);
    }
    assert.ok(fs.statSync(path.join(stagedBackend, 'assets/fonts/DejaVuSans.ttf')).size > 100000);
    assert.ok(fs.statSync(path.join(stagedBackend, 'assets/fonts/LICENSE-DejaVu.txt')).size > 0);
    const {timesheetPdf} = require(path.join(stagedBackend, 'dist/services/timesheetExport.js'));
    const pdf = await timesheetPdf([{date:'2026-11-11',clockIn:'09:00',clockOut:'17:00',project:'École Nord',hours:'8.00',regular:'8.00',overtime:'0.00',wage:'160.00'}], {userId:'fixture',start:'2026-11-11',end:'2026-11-11',timezone:'UTC'});
    assert.equal(pdf.subarray(0,5).toString(), '%PDF-');
    assert.ok(pdf.length > 5000);
  } finally {
    fs.rmSync(staging, {recursive:true,force:true});
  }
});
