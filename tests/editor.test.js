import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFiles, updateTranslation } from '../src/audit.js';
import { editorContext } from '../src/editor.js';

const file = (name, data) => ({ name, text: JSON.stringify(data) });
const unit = (value, state = 'translated') => ({ stringUnit: { value, state } });
const catalog = (localizations) => file('Localizable.xcstrings', { sourceLanguage: 'en', strings: { greeting: { localizations } } });

test('All strings JSON edits address the target file and preserve the exact source file', () => {
  const files = [file('common.en.json', { greeting: 'Hello' }), file('common.nb.json', { greeting: 'Hei' })];
  const entry = auditFiles(files).entries[0];
  const context = editorContext(entry, 'nb', entry.translations.nb[0]);
  assert.equal(context.fixable, true);
  assert.equal(context.target.fileName, 'common.nb.json');
  const updated = updateTranslation(files, context.target, 'God dag');
  assert.equal(updated[0].text, files[0].text);
  assert.equal(JSON.parse(updated[1].text).greeting, 'God dag');
});

test('missing JSON targets create the correct namespaced file and nested destination', () => {
  const files = [file('namespace.en.json', { page: { title: 'Home' } })];
  const entry = auditFiles(files, { targetLocales: ['es'] }).entries[0];
  const context = editorContext(entry, 'es');
  assert.equal(context.fixable, true);
  assert.equal(context.target.fileName, 'namespace.es.json');
  assert.deepEqual(context.target.path, ['page', 'title']);
  const updated = updateTranslation(files, context.target, 'Casa');
  assert.equal(updated[0].text, files[0].text);
  assert.deepEqual(JSON.parse(updated[1].text), { page: { title: 'Casa' } });
});

test('missing complex catalog targets are manual while basic missing units are editable', () => {
  const complex = auditFiles([catalog({ en: { variations: { plural: { one: unit('One'), other: unit('Many') } } } })], { targetLocales: ['nb'] });
  assert.equal(editorContext(complex.entries[0], 'nb').fixable, false);
  assert.equal(editorContext(complex.entries[0], 'nb', undefined, complex.issues[0]).fixable, false);
  const files = [catalog({ en: unit('Hello') })];
  const basic = auditFiles(files, { targetLocales: ['nb'] });
  const context = editorContext(basic.entries[0], 'nb');
  assert.equal(context.fixable, true);
  assert.equal(context.target.path, null);
  assert.equal(auditFiles(updateTranslation(files, context.target, 'Hei')).summary.errors, 0);
});

test('variant source selects the exact branch and falls back to plural other', () => {
  const report = auditFiles([catalog({
    en: { variations: { plural: { one: unit('One source'), other: unit('Other source') } } },
    pl: { variations: { plural: { one: unit('Jeden'), few: unit('Kilka'), other: unit('Inne') } } },
  })]);
  const entry = report.entries[0];
  assert.equal(editorContext(entry, 'pl', entry.translations.pl[0]).source, 'One source');
  assert.equal(editorContext(entry, 'pl', entry.translations.pl[1]).source, 'Other source');
  assert.equal(editorContext(entry, 'pl', entry.translations.pl[0]).fixable, true);
});

test('an exact issue supplies its destination and source; another locale cannot redirect an edit', () => {
  const report = auditFiles([catalog({ en: unit('Hello %@'), nb: unit('Hei %d'), es: unit('Hola %@') })]);
  const entry = report.entries[0];
  const issue = report.issues.find(finding => finding.type === 'placeholder');
  const exact = editorContext(entry, 'nb', entry.translations.nb[0], issue);
  assert.equal(exact.target, issue);
  assert.equal(exact.source, issue.source);
  const other = editorContext(entry, 'es', entry.translations.es[0], issue);
  assert.equal(other.target.locale, 'es');
  assert.deepEqual(other.target.path, entry.translations.es[0].path);
});

test('source-language, excluded, malformed-state and unknown missing structures cannot be edited', () => {
  const json = auditFiles([file('en.json', { title: 'Home' }), file('nb.json', { title: 'Hjem', extra: 'Extra' })]);
  assert.equal(editorContext(json.entries[0], 'en', json.entries[0].translations.en[0]).fixable, false);
  assert.equal(editorContext(json.entries.find(entry => entry.excluded), 'nb').fixable, false);
  const malformed = auditFiles([catalog({ nb: unit('Hei', 42) })]);
  assert.equal(editorContext(malformed.entries[0], 'nb', malformed.entries[0].translations.nb[0]).fixable, false);
  const unknown = auditFiles([catalog({ nb: { future: 'unknown data' } })]);
  assert.equal(editorContext(unknown.entries[0], 'nb').fixable, false);
});
