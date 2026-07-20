import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/src/vendor', { recursive: true });
await cp('index.html', 'dist/index.html');
await cp('src/main.js', 'dist/src/main.js');
await cp('src/styles.css', 'dist/src/styles.css');
await cp('src/vendor/qrcode.js', 'dist/src/vendor/qrcode.js');
console.log('Static site built in dist/.');
