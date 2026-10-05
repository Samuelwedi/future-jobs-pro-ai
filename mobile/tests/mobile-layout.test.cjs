const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/responsiveLayout.ts'), 'utf8');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { homeGridLayout, albumThumbnailSize } = context.exports;

test('home cards stay inside safe width across compact, tall, landscape and large text layouts', () => {
  for (const width of [240, 280, 320, 375, 390, 430, 600, 768, 844, 1024]) {
    for (const font of [1, 1.2, 1.4, 1.6, 2, 3]) {
      const g = homeGridLayout(width, font);
      for (const [count, size, gap] of [[g.captureColumns,g.captureWidth,9],[g.toolColumns,g.toolWidth,8]]) {
        assert.ok(size > 0);
        assert.ok(count * size + (count - 1) * gap <= width - 36 + 0.001);
      }
      if (font >= 1.6) assert.equal(g.toolColumns, 1);
      if (font >= 1.4) assert.equal(g.captureColumns, 1);
    }
  }
});
test('album thumbnails fill their container without horizontal overflow after a resize', () => {
  for (const width of [240, 320, 375, 430, 600, 844, 1024]) {
    const size = albumThumbnailSize(width);
    assert.ok(size > 0);
    assert.ok(Math.abs(3 * (size + 4) + 8 - width) < 0.001);
  }
  assert.ok(albumThumbnailSize(844) > albumThumbnailSize(320));
});
test('unmeasured initial layouts do not produce negative sizes', () => {
  assert.equal(albumThumbnailSize(0), 0);
  const g = homeGridLayout(0, 1);
  assert.equal(g.captureWidth, 0);
  assert.equal(g.toolWidth, 0);
});
