import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFiles, updateTranslation } from '../src/audit.js';

const file = (name, data) => ({ name, text: JSON.stringify(data, null, 2) });
const unit = value => ({ stringUnit: { value, state: 'translated' } });
const catalog = strings => file('Localizable.xcstrings', { sourceLanguage: 'en', version: '1.0', strings });

test('independent review: repeated named arguments may occur fewer times in another language', () => {
  const report = auditFiles([
    file('en.json', { greeting: 'Hello {name}, dear {name}' }),
    file('nb.json', { greeting: 'Hei {name}' }),
  ]);
  assert.equal(report.issues.some(issue => issue.type === 'placeholder'), false);
  assert.equal(report.summary.coverage, 100);
});

test('independent review: repeated positional arguments differ from distinct sequential arguments', () => {
  const repeated = auditFiles([
    file('en.json', { greeting: '%1$@, dear %1$@' }),
    file('nb.json', { greeting: 'Hei %1$@' }),
  ]);
  assert.equal(repeated.issues.some(issue => issue.type === 'placeholder'), false);
  const distinct = auditFiles([
    file('en.json', { greeting: '%@, dear %@' }),
    file('nb.json', { greeting: 'Hei %@' }),
  ]);
  assert.equal(distinct.issues.some(issue => issue.type === 'placeholder'), true);
});

test('independent review: unknown catalog variation axes cannot silently pass coverage', () => {
  const report = auditFiles([catalog({ greeting: { localizations: {
    en: unit('Hello'),
    nb: { variations: { futureAxis: { compact: unit('Hei') } } },
  } } })]);
  assert.equal(report.entries[0].translations.nb[0].value, 'Hei');
  assert.ok(report.issues.some(issue => issue.severity === 'warning' && /manual|unsupported|complex/i.test(`${issue.type} ${issue.title} ${issue.message}`)));
  assert.equal(report.summary.coverage, 0);
});

test('independent review: repairing a missing JSON string cannot destroy an existing nested target', () => {
  const files = [file('en.json', { title: 'Home' }), file('nb.json', { title: { legacy: 'Behold' } })];
  const before = structuredClone(files);
  const missing = auditFiles(files).issues.find(issue => issue.type === 'missing');
  assert.ok(missing);
  assert.throws(() => updateTranslation(files, missing, 'Hjem'), /conflict|non-string|manual|existing/i);
  assert.deepEqual(files, before);
});

test('independent review: target arrays and scalar metadata are preserved during unrelated JSON edits', () => {
  const files = [
    file('en.json', { title: 'Home' }),
    file('nb.json', { title: 'Hjem', metadata: { version: 3, enabled: true, aliases: ['home', 'index'], empty: null } }),
  ];
  const report = auditFiles(files);
  const entry = report.entries.find(entry => entry.key === 'title');
  const updated = updateTranslation(files, { fileName: 'nb.json', path: entry.translations.nb[0].path }, 'Start');
  const parsed = JSON.parse(updated[1].text);
  assert.equal(parsed.title, 'Start');
  assert.deepEqual(parsed.metadata, JSON.parse(files[1].text).metadata);
  assert.equal(updated[0].text, files[0].text);
});

test('independent review: literal dotted keys and nested keys remain different repair destinations', () => {
  const files = [file('en.json', { 'a.b': 'Literal', a: { b: 'Nested' } }), file('nb.json', {})];
  const report = auditFiles(files);
  assert.equal(report.entries.length, 2);
  assert.equal(new Set(report.entries.map(entry => entry.id)).size, 2);
  let updated = files;
  for (const issue of report.issues) updated = updateTranslation(updated, issue, issue.path.length === 1 ? 'Bokstavelig' : 'Nøstet');
  assert.deepEqual(JSON.parse(updated[1].text), { 'a.b': 'Bokstavelig', a: { b: 'Nøstet' } });
});

test('independent review: catalog repair preserves original locale spelling and variant siblings', () => {
  const files = [catalog({ Count: { localizations: {
    en: { variations: { plural: { one: unit('%lld item'), other: unit('%lld items') } } },
    nb_NO: { variations: { plural: { one: unit('%lld ting'), other: unit('%d ting') } }, futureField: 'retained' },
  } } })];
  const issue = auditFiles(files).issues.find(issue => issue.type === 'placeholder');
  assert.equal(issue.locale, 'nb-NO');
  const updated = updateTranslation(files, issue, '%lld ting');
  const record = JSON.parse(updated[0].text).strings.Count;
  assert.deepEqual(Object.keys(record.localizations), ['en', 'nb_NO']);
  assert.equal(record.localizations.nb_NO.futureField, 'retained');
  assert.equal(record.localizations.nb_NO.variations.plural.one.stringUnit.value, '%lld ting');
  assert.equal(record.localizations.nb_NO.variations.plural.other.stringUnit.value, '%lld ting');
});
