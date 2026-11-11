const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const root = process.env.CHAT_SOURCE_ROOT || path.join(__dirname, '../..');
const file = path.join(root, 'src/utils/chatHistory.ts');
const context = { exports: {} };
// Baseline lifecycle does not use this utility. Allow the same behavioral fixture
// to prove its missing network read, rather than failing at a missing import.
if (fs.existsSync(file)) vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, context);
module.exports = context.exports;
