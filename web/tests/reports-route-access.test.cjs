'use strict';
// Render the actual Layout with inert UI/hook substitutes to prove its Outlet
// never mounts Reports for a non-manager, including a direct URL and role refresh.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const router = require('react-router-dom');
function routeMatch(pattern, pathname) {
  let match;
  function Probe() { match = router.useMatch(pattern); return null; }
  renderToStaticMarkup(React.createElement(router.StaticRouter, { location: pathname }, React.createElement(Probe)));
  return match;
}
const source = fs.readFileSync(path.join(__dirname, '../src/components/Layout.tsx'), 'utf8');
function render(pathname, user) {
  const module = { exports: {} };
  let stateIndex = 0;
  const react = {
    createElement(type, props, ...children) { return { type, props: props || {}, children: children.flat(Infinity) }; },
    Fragment: 'Fragment', lazy: () => 'Lazy', Suspense: 'Suspense', useEffect() {},
    useState(initial) { stateIndex++; return [stateIndex === 7 ? user : initial, () => {}]; },
  };
  // This assertion keeps the hook substitution tied to Layout's actual user state.
  const stateCalls = [...source.matchAll(/useState(?:<[^;\n]*?>)?\(/g)];
  assert.equal(source.slice(0, source.indexOf('const [user, setUser]')).match(/useState(?:<[^;\n]*?>)?\(/g).length, 6);
  assert(stateCalls.length > 7);
  const ui = new Proxy({ __esModule: true,
    useTheme: () => ({ breakpoints: { down: () => false }, zIndex: { drawer: 1200 } }), useMediaQuery: () => false,
  }, { get: (object, key) => object[key] ?? key });
  const imports = {
    react, 'react-router-dom': { useNavigate: () => () => {}, useLocation: () => ({ pathname }), useMatch: pattern => routeMatch(pattern, pathname), Outlet: 'Outlet' },
    '@mui/material': ui, '@mui/icons-material': ui,
    '../services/authSession': {}, './NotificationCenter': { default: 'NotificationCenter', __esModule: true },
    './AppThemeProvider': { useAppTheme: () => ({ toggle() {} }) }, '../services/api': { API_BASE: 'http://synthetic.invalid' },
  };
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(key) { assert(Object.hasOwn(imports, key), key); return imports[key]; } });
  const tree = module.exports.default();
  const nodes = [];
  function walk(node) { if (node && typeof node === 'object') { nodes.push(node); for (const child of node.children || []) walk(child); } }
  walk(tree); return nodes;
}

test('direct Reports URLs never mount the page for employees, missing users or platform-only roles', () => {
  for (const url of ['/reports', '/reports/', '/REPORTS', '/reports//', '/r%65ports', '/%72eports/']) {
    for (const role of [undefined, null, '', 'employee', 'support_agent', 'supervisor', 'godadmin']) {
      const nodes = render(url, role == null ? null : { role });
      assert(!nodes.some(n => n.type === 'Outlet'), `${url} ${role}`);
      assert(nodes.some(n => n.props.role === 'alert' && n.children.includes('Manager access is required to view reports.')));
    }
  }
});
test('existing management roles retain Reports and non-Reports routes are unchanged', () => {
  for (const role of ['boss', 'owner', 'manager', 'admin', 'MaNaGeR']) assert(render('/reports', { role }).some(n => n.type === 'Outlet'));
  for (const url of ['/timesheet', '/projects', '/employee-portal', '/reports-other']) assert(render(url, { role: 'employee' }).some(n => n.type === 'Outlet'));
});
test('a role refresh removes Reports and a later manager role restores it', () => {
  assert(render('/reports', { role: 'manager' }).some(n => n.type === 'Outlet'));
  assert(!render('/reports', { role: 'employee' }).some(n => n.type === 'Outlet'));
  assert(render('/reports', { role: 'owner' }).some(n => n.type === 'Outlet'));
});
