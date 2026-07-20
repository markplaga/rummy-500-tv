import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await mkdir('dist/src/vendor', { recursive: true });

const sourceMain = await readFile('src/main.js', 'utf8');
const browserMain = sourceMain.replace(/^import\s+['"]\.\/styles\.css['"];?\s*/, '');
if (browserMain === sourceMain) {
  throw new Error('Expected the CSS import at the top of src/main.js.');
}

await cp('index.html', 'dist/index.html');
await writeFile('dist/src/main.js', browserMain);
await cp('src/styles.css', 'dist/src/styles.css');
await cp('src/vendor/qrcode.js', 'dist/src/vendor/qrcode.js');
console.log('Static site built in dist/.');
