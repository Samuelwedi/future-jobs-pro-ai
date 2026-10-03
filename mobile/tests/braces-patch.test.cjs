const test = require('node:test');
const assert = require('node:assert/strict');
const braces = require('braces');
const nested = (open, close, depth) => open.repeat(depth) + 'a,b' + close.repeat(depth);
test('brace mitigation preserves normal patterns and numeric expansion', () => {
  assert.deepEqual(braces.expand('src/{web,mobile}/{a,b}.ts'), ['src/web/a.ts','src/web/b.ts','src/mobile/a.ts','src/mobile/b.ts']);
  assert.deepEqual(braces.expand('{1..3}'), ['1','2','3']);
  assert.equal(braces.compile('{a,b}'), '(a|b)');
  assert.equal(braces.stringify(braces.parse('{a,b}')), '{a,b}');
  assert.doesNotThrow(() => braces.compile(nested('{','}',32)));
  assert.equal(braces.stringify(braces.parse('\\{literal\\}')), '{literal}');
});
test('deep braces, parentheses and mixed patterns fail with a controlled syntax error', () => {
  for(const pattern of [nested('{','}',4000), nested('(',')',4000), '{('.repeat(2000)+'x'+')}'.repeat(2000), '{'.repeat(4000)+'x']) {
    for(const fn of [braces.parse, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => fn(pattern), e => e instanceof SyntaxError && /safe nesting/.test(e.message));
    }
  }
});
test('caller-supplied deep or cyclic AST cannot reach recursive walkers', () => {
  let ast={type:'text',value:'x'};
  for(let i=0;i<10000;i++) ast={type:'root',nodes:[ast]};
  const cycle={type:'root',nodes:[]};cycle.nodes.push(cycle);
  for(const fn of [braces.compile,braces.expand,braces.stringify]) {
    for(const input of [ast,cycle]) assert.throws(() => fn(input), e => e instanceof SyntaxError && /safe depth/.test(e.message));
  }
});
