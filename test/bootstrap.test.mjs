import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('the built browser page loads its stylesheet and QR helper', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../dist/src/main.js', import.meta.url), 'utf8')
  ]);

  assert.match(html, /<link rel="stylesheet" href="\/src\/styles\.css"\s*\/?>/);
  assert.match(html, /<script src="\/src\/vendor\/qrcode\.js"><\/script>/);
  assert.match(html, /<script type="module" src="\/src\/main\.js"><\/script>/);
  assert.doesNotMatch(main, /import\s+['"].*\.css['"]/);
});

test('a visible fallback remains if JavaScript cannot start', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /<div id="app">[\s\S]*Rummy 500[\s\S]*Opening the table…[\s\S]*<\/div>/);
});
