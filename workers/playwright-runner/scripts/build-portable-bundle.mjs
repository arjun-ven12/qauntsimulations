import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'bundle');
const playwrightVersion = JSON.parse(
  await readFile(require.resolve('@playwright/test/package.json'), 'utf8'),
).version;

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await build({
  entryPoints: [resolve(root, 'src/cli.ts')],
  outfile: resolve(output, 'worker.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: false,
  banner: { js: '/* eslint-disable -- generated portable bundle */' },
  external: ['@playwright/test', '@playwright/test/package.json'],
});
await writeFile(
  resolve(output, 'package.json'),
  `${JSON.stringify({
    name: 'taskos-playwright-worker-bundle',
    version: '0.1.0',
    private: true,
    type: 'module',
    dependencies: { '@playwright/test': playwrightVersion },
  }, null, 2)}\n`,
);
