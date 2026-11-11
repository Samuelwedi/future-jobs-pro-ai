const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/screens/ChatScreen.tsx'), 'utf8');
test('full-screen chat protects system edges and avoids keyboards on both platforms', () => {
  assert.match(source, /keyboardVerticalOffset=\{0\}/);
  assert.match(source, /behavior=\{Platform.OS === 'ios' \? 'padding' : 'height'\}/);
  assert.match(source, /paddingTop: safeInsets.top \+ 16/);
  assert.match(source, /paddingBottom: keyboardVisible \? 12 : Math.max\(12, safeInsets.bottom\)/);
});
test('chat keeps taps available with keyboard open and removes keyboard listeners', () => {
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /Keyboard.addListener\('keyboardDidShow'/);
  assert.match(source, /show.remove\(\); hide.remove\(\)/);
  assert.match(source, /onLayout=\{\(\) => \{ if \(keyboardVisible\) flatListRef.current\?\.scrollToEnd/);
});
