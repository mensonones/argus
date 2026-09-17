import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectStack } from '../dist/context/stack.js';
import { buildContext } from '../dist/context/builder.js';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-stack-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function write(dir, name, data) {
  fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
  fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
}

test('stack detects declared frameworks/runners in affected packages without scanning siblings', async t => {
  const root = fixture(t);
  write(root, 'package.json', { packageManager: 'pnpm@10.0.0', scripts: { test: 'node --test test/*.js' } });
  write(root, 'packages/web/package.json', { dependencies: { next: '15', react: '19' }, devDependencies: { vitest: '3' } });
  write(root, 'packages/mobile/package.json', { dependencies: { 'react-native': '1' } });
  const files = ['packages/web/src/app.tsx'];
  const detected = await detectStack(root, files);
  assert.deepEqual(detected.manifests, ['package.json', 'packages/web/package.json']);
  assert.ok(detected.signals.some(s => s.name === 'Next.js' && s.manifest === 'packages/web/package.json' && s.evidence === 'dependencies.next'));
  assert.ok(detected.signals.some(s => s.name === 'Vitest'));
  assert.ok(detected.signals.some(s => s.name === 'Node.js test runner'));
  assert.ok(!detected.signals.some(s => s.name === 'React Native'));
  assert.deepEqual(await detectStack(root, [...files, ...files]), detected);
  const context = await buildContext(root, { baseRef: 'main', raw: '', files: [{ path: files[0], status: 'M', additions: 1, deletions: 1, patch: '' }] });
  assert.equal(context.metadata.packageManager, 'pnpm');
  assert.ok(context.metadata.frameworks.includes('Next.js'));
  assert.match(context.overview, /declaration, not verified usage/);
});

test('stack skips malformed, oversized, ignored and external manifests', async t => {
  const root = fixture(t); const outside = fixture(t);
  fs.writeFileSync(path.join(root, 'package.json'), '{broken');
  write(root, 'node_modules/fake/package.json', { dependencies: { react: '1' } });
  write(outside, 'package.json', { dependencies: { next: '1' } });
  fs.mkdirSync(path.join(root, 'external'));
  fs.symlinkSync(path.join(outside, 'package.json'), path.join(root, 'external/package.json'));
  fs.mkdirSync(path.join(root, 'big'));
  fs.writeFileSync(path.join(root, 'big/package.json'), ' '.repeat(1024 * 1024 + 1));
  const detected = await detectStack(root, ['external/a.js', 'big/a.js', 'node_modules/fake/a.js', '../outside/a.js']);
  assert.equal(detected.signals.length, 0);
  assert.equal(detected.warnings.length, 3);
  assert.ok(detected.warnings.some(w => w.includes('outside repository')));
});

test('stack bounds affected-directory inspection and discloses incompleteness', async t => {
  const root = fixture(t);
  const result = await detectStack(root, Array.from({ length: 100 }, (_, i) => `packages/p${i}/a.js`));
  assert.equal(result.truncated, true);
  assert.deepEqual(result.signals, []);
});
