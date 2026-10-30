// Бір файлды жинақ: dist/qazchem-lab.html (толық құжат) және dist/artifact.html (claude.ai артефактына арналған фрагмент).
// Қолдану: node scripts/build-single.mjs   (esbuild қажет: npm i -D esbuild)
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dist-single');
mkdirSync(out, { recursive: true });
const r = await build({
  entryPoints: [resolve(root, 'src/main.tsx')], bundle: true, minify: true, format: 'iife', target: 'es2020', jsx: 'automatic',
  outdir: out, write: false, define: { 'process.env.NODE_ENV': '"production"' }, preserveSymlinks: false, legalComments: 'none',
});
const js = r.outputFiles.find(f => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
const css = r.outputFiles.find(f => f.path.endsWith('.css')).text;
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Mono:wght@500&display=swap">';
const body = `<div id="root"></div><noscript>QAZCHEM LAB жұмыс істеуі үшін JavaScript қосулы болуы керек.</noscript><script>${js}</script>`;
const fragment = `<title>QAZCHEM LAB</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n${fonts}\n<style id="app-css">${css}</style>\n${body}\n`;
writeFileSync(resolve(out, 'artifact.html'), fragment);
writeFileSync(resolve(out, 'qazchem-lab.html'), `<!doctype html><html lang="kk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${fragment.split('\n').slice(0, 1).join('')}${fonts}<style id="app-css">${css}</style></head><body>${body}</body></html>`);
console.log('ok', (fragment.length / 1024).toFixed(0) + ' KB');
