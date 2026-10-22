import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'stringlight-package-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

test('the public package export audits and repairs without adopting the UI', async () => {
  const api = await import('@kjdyrland/stringlight');
  assert.deepEqual(Object.keys(api).sort(), ['auditFiles', 'placeholders', 'updateTranslation']);
  const files = [{ name: 'en.json', text: '{"greeting":"Hello {name}"}' }, { name: 'nb.json', text: '{"greeting":"Hei"}' }];
  const report = api.auditFiles(files);
  const finding = report.issues.find(issue => issue.type === 'placeholder');
  assert.ok(finding?.fixable);
  const repaired = api.updateTranslation(files, finding, 'Hei {name}');
  assert.equal(repaired[0].text, files[0].text);
  assert.equal(api.auditFiles(repaired).summary.errors, 0);
  assert.deepEqual(api.placeholders('%@ %lld').tokens, api.placeholders('%2$lld %1$@').tokens);
});

test('package contents include the reusable core and exclude hosting, UI and private artifacts', (t) => {
  const cache = temporary(t);
  const args = ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', cache];
  const command = process.env.npm_execpath ? process.execPath : 'npm';
  const output = execFileSync(command, process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args, { cwd: root, encoding: 'utf8' });
  const [packed] = JSON.parse(output);
  const paths = packed.files.map(file => file.path);
  for (const required of ['package.json', 'src/audit.js', 'src/index.d.ts', 'scripts/audit.mjs', 'README.md', 'LICENSE', 'CHANGELOG.md', 'docs/API.md']) assert.ok(paths.includes(required), `${required} must be included`);
  assert.ok(paths.some(path => path.startsWith('examples/')), 'include runnable examples');
  assert.ok(paths.every(path => ['package.json', 'src/audit.js', 'src/index.d.ts', 'scripts/audit.mjs', 'README.md', 'LICENSE', 'CHANGELOG.md', 'docs/API.md'].includes(path) || path.startsWith('examples/')), `Unexpected packaged file: ${paths.join(', ')}`);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
});

test('TypeScript consumers resolve the public declarations and receive useful input validation', (t) => {
  const directory = temporary(t);
  mkdirSync(join(directory, 'node_modules', '@kjdyrland'), { recursive: true });
  symlinkSync(root, join(directory, 'node_modules', '@kjdyrland', 'stringlight'), 'junction');
  const consumer = join(directory, 'consumer.mts');
  writeFileSync(consumer, `
import { auditFiles, updateTranslation, placeholders, type AuditReport, type AuditIssue, type LocalizationFile } from '@kjdyrland/stringlight';
const files: readonly LocalizationFile[] = [{ name: 'en.json', text: '{"hello":"Hello"}' }];
const report: AuditReport = auditFiles(files, { sourceLocale: 'en', targetLocales: ['nb'] as const });
const problem: AuditIssue | undefined = report.issues[0];
if (problem?.fixable) updateTranslation(files, problem, 'Hei');
for (const entry of report.entries) {
  if (entry.format === 'xcstrings') entry.sourceVariants.map(unit => unit.value);
  else entry.jsonPath.join('.');
}
const argumentsFound: string[] = placeholders('%@').tokens;
// @ts-expect-error translation values must be text
updateTranslation(files, { fileName: 'nb.json', path: ['hello'] }, 123);
// @ts-expect-error input files need both name and text
auditFiles([{ name: 'en.json' }]);
// @ts-expect-error locale targets are an array, not a comma-separated string
auditFiles(files, { targetLocales: 'nb,es' });
`);
  execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', consumer], { cwd: directory, encoding: 'utf8' });
});
