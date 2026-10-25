import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFiles, updateTranslation } from '../src/audit.js';
import { editorContext } from '../src/editor.js';

const phraseSet = (values, state = 'translated', extra = {}) => ({ stringSet: { values, state, ...extra } });
const catalog = (localizations) => [{ name: 'AppShortcuts.xcstrings', text: JSON.stringify({
  sourceLanguage: 'en', version: '1.1', futureRoot: { retained: true }, strings: {
    'Open ${applicationName}': { comment: 'Synthetic shortcut', localizations },
  },
}, null, 2) }];

test('phrase alternatives are extracted individually without requiring equal counts or order', () => {
  const report = auditFiles(catalog({
    en: phraseSet(['Open ${applicationName}', 'Open ${item} in ${applicationName}']),
    nb: phraseSet(['Åpne ${item} i ${applicationName}', 'Start ${applicationName}', 'Vis ${applicationName}']),
  }), { targetLocales: ['nb'] });
  assert.equal(report.errors.length, 0);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.summary.warnings, 0);
  assert.equal(report.summary.coverage, 100);
  const [entry] = report.entries;
  assert.equal(entry.translations.nb.length, 3);
  assert.equal(entry.translations.nb[0].kind, 'string-set');
  assert.deepEqual(entry.translations.nb[2].path, ['strings', entry.key, 'localizations', 'nb', 'stringSet', 'values', '2']);
  assert.equal(editorContext(entry, 'nb', entry.translations.nb[0]).source, 'Open ${item} in ${applicationName}');
  assert.equal(editorContext(entry, 'nb', entry.translations.nb[1]).source, 'Open ${applicationName}');
});

test('each phrase is checked for empty text and exact App Shortcut placeholder syntax', () => {
  const report = auditFiles(catalog({
    en: phraseSet(['Open ${applicationName}']),
    nb: phraseSet(['', 'Start app', 'Åpne {applicationName}', 'Åpne ${applicationName}']),
  }));
  assert.equal(report.issues.filter(issue => issue.type === 'empty').length, 1);
  const mismatches = report.issues.filter(issue => issue.type === 'placeholder');
  assert.deepEqual(mismatches.map(issue => issue.path.at(-1)), ['1', '2']);
  assert.ok(mismatches.every(issue => issue.source === 'Open ${applicationName}'));
  assert.equal(report.summary.errors, 3);
  assert.equal(report.summary.coverage, 0);
});

test('shared review state applies to every phrase and malformed shared state is manual-only', () => {
  const files = catalog({ en: phraseSet(['Open ${applicationName}']), nb: phraseSet(['Åpne ${applicationName}', 'Start app'], 'needs_review') });
  const report = auditFiles(files);
  assert.equal(report.issues.filter(issue => issue.type === 'review').length, 2);
  assert.equal(report.summary.coverage, 0);
  for (const state of [null, { unexpected: true }]) {
    const malformed = catalog({ en: phraseSet(['Open ${applicationName}']), nb: phraseSet(['Start app'], state) });
    const before = structuredClone(malformed);
    const findings = auditFiles(malformed).issues;
    assert.ok(findings.some(issue => issue.type === 'placeholder'));
    assert.ok(findings.every(issue => !issue.fixable));
    for (const issue of findings) assert.throws(() => updateTranslation(malformed, issue, 'Åpne ${applicationName}'), /manual edit/);
    assert.deepEqual(malformed, before);
  }
});

test('editing one reviewed phrase preserves every sibling, metadata and the shared review state', () => {
  const files = catalog({
    en: phraseSet(['Open ${applicationName}']),
    nb: phraseSet(['Start app', 'Åpne ${applicationName}'], 'needs_review', { futureField: { retained: true } }),
  });
  const before = structuredClone(files);
  const issue = auditFiles(files).issues.find(issue => issue.type === 'placeholder');
  const updated = updateTranslation(files, issue, 'Start ${applicationName}');
  assert.deepEqual(files, before);
  const original = JSON.parse(files[0].text);
  const parsed = JSON.parse(updated[0].text);
  assert.deepEqual(parsed.futureRoot, original.futureRoot);
  assert.deepEqual(parsed.strings[issue.key].localizations.en, original.strings[issue.key].localizations.en);
  assert.deepEqual(parsed.strings[issue.key].localizations.nb, phraseSet(['Start ${applicationName}', 'Åpne ${applicationName}'], 'needs_review', { futureField: { retained: true } }));
  assert.equal(auditFiles(updated).issues.some(issue => issue.type === 'placeholder'), false);
  assert.equal(auditFiles(updated).issues.filter(issue => issue.type === 'review').length, 2);
});

test('editing a single-phrase set can complete its state and never creates a stringUnit', () => {
  const files = catalog({ en: phraseSet(['Open ${applicationName}']), nb: phraseSet(['Start app'], 'needs_review') });
  const issue = auditFiles(files).issues.find(issue => issue.type === 'placeholder');
  const updated = updateTranslation(files, issue, 'Start ${applicationName}');
  const localization = JSON.parse(updated[0].text).strings[issue.key].localizations.nb;
  assert.deepEqual(localization, phraseSet(['Start ${applicationName}']));
  assert.equal(auditFiles(updated).summary.errors, 0);
  assert.equal(auditFiles(updated).summary.warnings, 0);
});

test('missing and malformed phrase-set locales cannot silently pass or be repaired as simple strings', () => {
  for (const target of [undefined, phraseSet([]), phraseSet(['Valid ${applicationName}', 123]), { stringSet: { state: 'translated', values: {} } }]) {
    const files = catalog({ en: phraseSet(['Open ${applicationName}']), ...(target ? { nb: target } : {}) });
    const report = auditFiles(files, { targetLocales: ['nb'] });
    const missing = report.issues.find(issue => issue.type === 'missing');
    assert.ok(missing);
    assert.equal(missing.fixable, false);
    assert.equal(report.summary.errors, 1);
    assert.equal(report.summary.coverage, 0);
    assert.equal(editorContext(report.entries[0], 'nb').fixable, false);
    assert.throws(() => updateTranslation(files, missing, 'Åpne ${applicationName}'), /manual edit/);
  }
});

test('phrase repair rejects stale indices and malformed sets without changing input files', () => {
  const files = catalog({ en: phraseSet(['Open ${applicationName}']), nb: phraseSet(['Start app']) });
  const issue = auditFiles(files).issues.find(issue => issue.type === 'placeholder');
  const before = structuredClone(files);
  assert.throws(() => updateTranslation(files, { ...issue, path: [...issue.path.slice(0, -1), '1'] }, 'Åpne ${applicationName}'), /existing string/);
  assert.deepEqual(files, before);
  const malformed = catalog({ en: phraseSet(['Open ${applicationName}']), nb: phraseSet(['Start app', false]) });
  assert.throws(() => updateTranslation(malformed, issue, 'Åpne ${applicationName}'), /existing string/);
});
