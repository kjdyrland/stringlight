import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const script = fileURLToPath(new URL('../scripts/audit.mjs', import.meta.url));

function fixture(t, files) {
  const directory = mkdtempSync(join(tmpdir(), 'stringlight-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(files)) writeFileSync(join(directory, name), typeof value === 'string' ? value : JSON.stringify(value));
  return directory;
}

function run(directory, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  return result;
}

test('CLI emits a JSON report and succeeds for a clean translated pair', (t) => {
  const directory = fixture(t, { 'en.json': { welcome: 'Hello %@' }, 'fr.json': { welcome: 'Bonjour %@' } });
  const result = run(directory, ['en.json', 'fr.json', '--source', 'en']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.files, ['en.json', 'fr.json']);
  assert.equal(report.summary.coverage, 100);
  assert.equal(report.summary.errors, 0);
  assert.deepEqual(report.issues, []);
});

test('CLI fails a missing required target with diagnostic status 1', (t) => {
  const directory = fixture(t, { 'en.json': { welcome: 'Hello' }, 'fr.json': { welcome: 'Bonjour' } });
  const result = run(directory, ['en.json', 'fr.json', '--target', 'de']);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.errors, 1);
  assert.ok(report.issues.some((issue) => issue.locale === 'de' && issue.type === 'missing' && issue.fileName === 'de.json'));
  assert.equal(report.errors.length, 0);
});

test('CLI does not fail warnings or informational suggestions', (t) => {
  const directory = fixture(t, { 'en.json': { brand: 'Wayfarer', welcome: 'Hello' }, 'fr.json': { brand: 'Wayfarer', welcome: ' Bonjour ' } });
  const result = run(directory, ['en.json', 'fr.json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.issues.some((issue) => issue.severity === 'warning'));
  assert.ok(report.issues.some((issue) => issue.severity === 'info'));
});

test('CLI reports malformed input separately with status 2', (t) => {
  const directory = fixture(t, { 'en.json': { welcome: 'Hello' }, 'fr.json': '{ broken json' });
  const result = run(directory, ['en.json', 'fr.json']);
  assert.equal(result.status, 2, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.errors.some((error) => error.fileName === 'fr.json' && /Invalid JSON/.test(error.message)));
});

test('CLI writes Markdown only when requested and preserves locale inputs', (t) => {
  const directory = fixture(t, { 'en.json': { greeting: 'Hello %@' }, 'fr.json': { greeting: '<img src=x onerror=alert(1)>' } });
  const before = readFileSync(join(directory, 'fr.json'), 'utf8');
  const result = run(directory, ['en.json', 'fr.json', '--format', 'markdown', '--out', 'audit.md']);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  const report = readFileSync(join(directory, 'audit.md'), 'utf8');
  assert.match(report, /^# Stringlight audit/);
  assert.match(report, /Placeholders do not match/);
  assert.ok(report.includes('&lt;img'));
  assert.equal(readFileSync(join(directory, 'fr.json'), 'utf8'), before);
});

test('CLI rejects invalid usage, unreadable files, and overwriting an input', (t) => {
  const directory = fixture(t, { 'en.json': { welcome: 'Hello' } });
  symlinkSync(join(directory, 'en.json'), join(directory, 'alias.json'));
  for (const args of [[], ['--unknown'], ['en.json', '--source'], ['en.json', '--out', '-h'], ['en.json', '--format', 'html'], ['en.json', '--target', 'invalid!!'], ['missing.json'], ['en.json', '--out', 'en.json'], ['en.json', '--out', 'alias.json']]) {
    const result = run(directory, args);
    assert.equal(result.status, 2, `Unexpected status for ${args.join(' ')}: ${result.stderr}`);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Stringlight:/);
  }
  const help = run(directory, ['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Exit status: 0/);
  assert.equal(readFileSync(join(directory, 'en.json'), 'utf8'), '{"welcome":"Hello"}');
});
