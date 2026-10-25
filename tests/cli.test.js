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

test('CLI audits phrase alternatives and exposes exact placeholder failures and shared review warnings', (t) => {
  const data = { sourceLanguage: 'en', version: '1.1', strings: {
    'Inspect ${applicationName}': { localizations: {
      en: { stringSet: { state: 'translated', values: ['Inspect ${applicationName}', 'Inspect ${item} in ${applicationName}'] } },
      nb: { stringSet: { state: 'translated', values: ['Se ${item} i ${applicationName}', 'Se i ${applicationName}', 'Undersøk ${applicationName}'] } },
    } },
  } };
  const directory = fixture(t, { 'AppShortcuts.xcstrings': data });
  const clean = run(directory, ['AppShortcuts.xcstrings', '--target', 'nb', '--fail-on', 'warning']);
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(JSON.parse(clean.stdout).issues, []);

  data.strings['Inspect ${applicationName}'].localizations.nb.stringSet.values[1] = 'Se i {applicationName}';
  writeFileSync(join(directory, 'AppShortcuts.xcstrings'), JSON.stringify(data));
  const before = readFileSync(join(directory, 'AppShortcuts.xcstrings'), 'utf8');
  const broken = run(directory, ['AppShortcuts.xcstrings', '--target', 'nb']);
  assert.equal(broken.status, 1, broken.stderr);
  const mismatch = JSON.parse(broken.stdout).issues.find(issue => issue.type === 'placeholder');
  assert.deepEqual(mismatch.path, ['strings', 'Inspect ${applicationName}', 'localizations', 'nb', 'stringSet', 'values', '1']);
  assert.equal(readFileSync(join(directory, 'AppShortcuts.xcstrings'), 'utf8'), before);

  data.strings['Inspect ${applicationName}'].localizations.nb.stringSet.values[1] = 'Se i ${applicationName}';
  data.strings['Inspect ${applicationName}'].localizations.nb.stringSet.state = 'needs_review';
  writeFileSync(join(directory, 'AppShortcuts.xcstrings'), JSON.stringify(data));
  const advisory = run(directory, ['AppShortcuts.xcstrings', '--target', 'nb', '--fail-on', 'error']);
  assert.equal(advisory.status, 0, advisory.stderr);
  assert.equal(JSON.parse(advisory.stdout).issues.filter(issue => issue.type === 'review').length, 3);
  const strict = run(directory, ['AppShortcuts.xcstrings', '--target', 'nb', '--fail-on', 'warning']);
  assert.equal(strict.status, 1, strict.stderr);
});

test('CLI does not fail warnings or informational suggestions', (t) => {
  const directory = fixture(t, { 'en.json': { brand: 'Wayfarer', welcome: 'Hello' }, 'fr.json': { brand: 'Wayfarer', welcome: ' Bonjour ' } });
  const result = run(directory, ['en.json', 'fr.json']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.issues.some((issue) => issue.severity === 'warning'));
  assert.ok(report.issues.some((issue) => issue.severity === 'info'));
});

test('CLI version and help work without input files', (t) => {
  const directory = fixture(t, {});
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const flag of ['--version', '-v']) {
    const result = run(directory, [flag]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, `${version}\n`);
    assert.equal(result.stderr, '');
  }
  for (const flag of ['--help', '-h']) {
    const result = run(directory, [flag]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: stringlight <files\.\.\.>/);
    assert.match(result.stdout, /node scripts\/audit\.mjs/);
    assert.match(result.stdout, /--fail-on <error\|warning\|info>/);
    assert.match(result.stdout, /Inputs are read only/);
    assert.equal(result.stderr, '');
  }
});

test('CLI warning threshold includes errors and warnings while allowing informational findings', (t) => {
  const warnings = fixture(t, { 'en.json': { greeting: 'Hello' }, 'fr.json': { greeting: ' Bonjour ' } });
  const warningResult = run(warnings, ['en.json', 'fr.json', '--fail-on', 'warning']);
  assert.equal(warningResult.status, 1, warningResult.stderr);
  const warningReport = JSON.parse(warningResult.stdout);
  assert.equal(warningReport.summary.errors, 0);
  assert.ok(warningReport.issues.some(issue => issue.severity === 'warning'));

  const info = fixture(t, { 'en.json': { brand: 'Wayfarer' }, 'fr.json': { brand: 'Wayfarer' } });
  const infoResult = run(info, ['en.json', 'fr.json', '--fail-on', 'warning']);
  assert.equal(infoResult.status, 0, infoResult.stderr);
  assert.ok(JSON.parse(infoResult.stdout).issues.every(issue => issue.severity === 'info'));

  const errors = fixture(t, { 'en.json': { greeting: 'Hello %@' }, 'fr.json': { greeting: 'Bonjour' } });
  const errorResult = run(errors, ['en.json', 'fr.json', '--fail-on', 'warning']);
  assert.equal(errorResult.status, 1, errorResult.stderr);
  assert.ok(JSON.parse(errorResult.stdout).issues.some(issue => issue.severity === 'error'));
});

test('CLI info threshold fails informational findings and accepts a clean review', (t) => {
  const directory = fixture(t, { 'en.json': { brand: 'Wayfarer' }, 'fr.json': { brand: 'Wayfarer' } });
  const findings = run(directory, ['en.json', 'fr.json', '--fail-on', 'info']);
  assert.equal(findings.status, 1, findings.stderr);
  assert.ok(JSON.parse(findings.stdout).issues.some(issue => issue.severity === 'info'));

  writeFileSync(join(directory, 'fr.json'), JSON.stringify({ brand: 'Voyageur' }));
  const clean = run(directory, ['en.json', 'fr.json', '--fail-on', 'info']);
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(JSON.parse(clean.stdout).issues, []);
});

test('CLI input problems return status 2 at every finding threshold', (t) => {
  const directory = fixture(t, { 'en.json': { greeting: 'Hello' }, 'fr.json': '{ broken json' });
  for (const severity of ['error', 'warning', 'info']) {
    const result = run(directory, ['en.json', 'fr.json', '--fail-on', severity]);
    assert.equal(result.status, 2, result.stderr);
    assert.ok(JSON.parse(result.stdout).errors.length > 0);
  }
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
  for (const args of [[], ['--unknown'], ['en.json', '--source'], ['en.json', '--out', '-h'], ['en.json', '--format', 'html'], ['en.json', '--fail-on', 'notice'], ['en.json', '--fail-on', 'constructor'], ['en.json', '--fail-on'], ['en.json', '--target', 'invalid!!'], ['missing.json'], ['en.json', '--out', 'en.json'], ['en.json', '--out', 'alias.json']]) {
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
