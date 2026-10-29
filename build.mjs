// 建置腳本：用 esbuild 打包，輸出到 dist/（GitHub Pages 直接發佈這個資料夾）
//   node build.mjs          正式建置
//   node build.mjs --dev    本機開發（自動重新建置 + http://localhost:5173）
//   node build.mjs --fake   使用假的後端（本機測試畫面用，不連 Supabase）
import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const dev = args.has('--dev');
const fake = args.has('--fake');
const outdir = path.join(root, 'dist');

const config = JSON.parse(readFileSync(path.join(root, 'app.config.json'), 'utf8'));

/** 測試模式：把 src/data/backend.ts 換成假的後端 */
const fakeBackendPlugin = {
  name: 'fake-backend',
  setup(build) {
    build.onResolve({ filter: /\/backend\.ts$/ }, (a) =>
      a.importer.includes(`${path.sep}src${path.sep}`)
        ? { path: path.join(root, 'tests', 'fake', 'fakeBackend.ts') }
        : undefined,
    );
  },
};

/** 每次建置完成後：產生 index.html、複製 public/、產生 service worker */
const finishPlugin = {
  name: 'finish',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length || !result.metafile) return;
      const outputs = Object.keys(result.metafile.outputs).map((p) => path.relative(outdir, path.join(root, p)).split(path.sep).join('/'));
      const js = outputs.find((p) => p.endsWith('.js'));
      const css = outputs.find((p) => p.endsWith('.css'));
      const version = createHash('sha1').update(outputs.join('|') + (dev ? Date.now() : '')).digest('hex').slice(0, 10);

      let html = readFileSync(path.join(root, 'index.html'), 'utf8');
      html = html
        .replace('<!--CSS-->', css ? `<link rel="stylesheet" href="./${css}">` : '')
        .replace('<!--JS-->', `<script type="module" src="./${js}"></script>`);
      writeFileSync(path.join(outdir, 'index.html'), html);

      cpSync(path.join(root, 'public'), outdir, { recursive: true });
      const publicFiles = ['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'icon.svg']
        .filter((f) => existsSync(path.join(root, 'public', f)));
      const precache = ['./', './index.html', ...outputs.filter((p) => !p.endsWith('.map')).map((p) => `./${p}`), ...publicFiles.map((f) => `./${f}`)];
      const sw = readFileSync(path.join(root, 'src', 'sw.js'), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      writeFileSync(path.join(outdir, 'sw.js'), sw);
      writeFileSync(path.join(outdir, '.nojekyll'), '');
      console.log(`[build] 完成 ${new Date().toLocaleTimeString()}  版本 ${version}${fake ? '（假後端）' : ''}`);
    });
  },
};

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const options = {
  entryPoints: { app: path.join(root, 'src', 'main.tsx') },
  bundle: true,
  format: 'esm',
  target: ['es2020', 'safari15', 'chrome100'],
  outdir: path.join(outdir, 'assets'),
  entryNames: '[name]-[hash]',
  assetNames: '[name]-[hash]',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  jsx: 'automatic',
  metafile: true,
  logLevel: 'warning',
  legalComments: 'none',
  define: {
    __SUPABASE_URL__: JSON.stringify(config.supabaseUrl || ''),
    __SUPABASE_KEY__: JSON.stringify(config.supabaseKey || ''),
    __FAKE_BACKEND__: JSON.stringify(fake),
    'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
  },
  plugins: [...(fake ? [fakeBackendPlugin] : []), finishPlugin],
};

if (dev) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: outdir, port: Number(process.env.PORT || 5173), host: '0.0.0.0' });
  console.log(`[dev] http://localhost:${port}/`);
} else {
  await esbuild.build(options);
}
