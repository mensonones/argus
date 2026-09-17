import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectStack } from '../dist/context/stack.js';
import { buildContext } from '../dist/context/builder.js';
import { suggestStackSkills } from '../dist/context/stack-skills.js';
import { spawnSync } from 'node:child_process';

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

test('stack supplements remain inside nearest package and enabled lenses', async t => {
  const root = fixture(t);
  write(root, 'package.json', { dependencies: { react: '19' }, scripts: { test: 'node --test' } });
  write(root, 'packages/plain/package.json', { dependencies: { express: '5' } });
  write(root, 'packages/web/package.json', { dependencies: { react: '19' }, scripts: { test: 'node --test' } });
  const files = ['src/App.jsx', 'test/async.test.js', 'packages/plain/index.js', 'packages/plain/test/one.test.js', 'packages/web/src/App.tsx', 'packages/web/test/one.test.js'];
  const stack = await detectStack(root, files);
  assert.deepEqual(suggestStackSkills(stack, files, []), []);
  const correctness = suggestStackSkills(stack, files, ['correctness']);
  assert.ok(correctness.every(s => s.skill === 'react-review' && s.reviewers.join() === 'correctness'));
  const suggestions = suggestStackSkills(stack, files, ['tests', 'correctness']);
  assert.equal(suggestions.length, 4);
  assert.ok(suggestions.every(s => s.requiresCodeConfirmation && s.evidence.length));
  assert.ok(suggestions.every(s => !s.files.some(f => f.startsWith('packages/plain/'))));
  assert.deepEqual(suggestions.find(s => s.skill === 'node-test-review' && s.manifest === 'package.json').files, ['test/async.test.js']);
  assert.ok(!suggestStackSkills(stack, ['README.md', '../other/test/a.js', 'node_modules/fake/test/a.js'], ['tests']).length);
  assert.deepEqual(suggestStackSkills(stack, [...files].reverse(), ['tests', 'correctness']), suggestions);
});

test('unsupported stacks and Node production files do not suggest a tests supplement', async t => {
  const root = fixture(t);
  write(root, 'package.json', { dependencies: { vue: '3' }, scripts: { test: 'node --test' } });
  const stack = await detectStack(root, ['src/index.js']);
  assert.deepEqual(suggestStackSkills(stack, ['src/index.js'], ['tests', 'correctness']), []);
  write(root, 'package.json', { devDependencies: { vitest: '3' } });
  assert.deepEqual(suggestStackSkills(await detectStack(root, ['test/a.test.js']), ['test/a.test.js'], ['tests']), []);
});

test('Node runner observes unhandled assertion rejection but swallowed errors can pass', () => {
  const prefix = "import test from 'node:test'; import assert from 'node:assert/strict'; const verify = () => assert.rejects(async () => 42, /Unavailable/);";
  for (const [body, expected] of [['verify();', 1], ['verify().catch(() => {});', 0], ['return verify();', 1]]) {
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `${prefix} test('wrong behavior control', () => { ${body} });`], { encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, expected, run.stdout + run.stderr);
  }
});
