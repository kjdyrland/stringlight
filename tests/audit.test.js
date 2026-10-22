import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFiles, placeholders, updateTranslation } from '../src/audit.js';

const file = (name, data) => ({ name, text: JSON.stringify(data, null, 2) });
const unit = (value, state = 'translated') => ({ stringUnit: { value, state } });
const catalog = (strings, extra = {}) => file('Localizable.xcstrings', { sourceLanguage: 'en', strings, version: '1.0', ...extra });

test('catalog union finds missing targets, excludes source rows and shouldTranslate false', () => {
  const report = auditFiles([catalog({
    Hello: { localizations: { nb: unit('Hei'), es: unit('Hola') } },
    Goodbye: { localizations: { nb: unit('Ha det') } },
    Brand: { shouldTranslate: false, localizations: {} },
  })]);
  assert.equal(report.summary.entries, 2);
  assert.deepEqual(report.locales.map(({ code, total, translated }) => ({ code, total, translated })), [
    { code: 'es', total: 2, translated: 1 }, { code: 'nb', total: 2, translated: 2 },
  ]);
  assert.deepEqual(report.issues.map(({ key, locale, type }) => ({ key, locale, type })), [{ key: 'Goodbye', locale: 'es', type: 'missing' }]);
  assert.equal(report.entries[0].source, 'Hello');
});

test('printf argument identity supports positional reorder, escaped percent, integer widths and dynamic widths', () => {
  assert.deepEqual(placeholders('%@ has %lld (100%%)').tokens, placeholders('%2$lld til %1$@ (100%%)').tokens);
  assert.notDeepEqual(placeholders('%lld').tokens, placeholders('%d').tokens);
  assert.deepEqual(placeholders('%*.*f').tokens, placeholders('%3$*1$.*2$f').tokens);
  assert.deepEqual(placeholders('100% complete and 10% off').tokens, []);
  assert.deepEqual(placeholders('Hi {name}, {{count}}').tokens, ['mustache:count', 'named:name']);
  assert.notDeepEqual(placeholders('{name}').tokens, placeholders('{{name}}').tokens);
  assert.deepEqual(placeholders('Hello {name}, dear {name}').tokens, placeholders('Hei {name}').tokens);
  assert.deepEqual(placeholders('%1$@, dear %1$@').tokens, placeholders('Hei %1$@').tokens);
  assert.notDeepEqual(placeholders('%@ %@').tokens, placeholders('%1$@').tokens);
});

test('missing, empty, placeholders, review, same-source and whitespace remain separate findings', () => {
  const report = auditFiles([catalog({
    'Hello %@': { localizations: { nb: unit('Hei %d') } },
    Empty: { localizations: { nb: unit('  ') } },
    Review: { localizations: { nb: unit('Se over', 'needs_review') } },
    Machine: { localizations: { nb: unit('Maskin', 'machine_translated') } },
    New: { localizations: { nb: unit('Ny', 'new') } },
    Oslo: { localizations: { nb: unit('Oslo') } },
    ' Space ': { localizations: { nb: unit('Mellomrom') } },
    Missing: {},
  })]);
  assert.equal(report.issues.filter((issue) => issue.type === 'review').length, 3);
  assert.equal(report.issues.filter((issue) => issue.type === 'placeholder').length, 1);
  assert.equal(report.issues.filter((issue) => issue.type === 'empty').length, 1);
  assert.equal(report.issues.filter((issue) => issue.type === 'missing').length, 1);
  assert.equal(report.issues.filter((issue) => issue.type === 'same-source').length, 1);
  assert.ok(report.issues.some((issue) => issue.type === 'whitespace' && issue.key === ' Space '));
  assert.equal(report.locales[0].translated, 2);
});

test('plural leaves use corresponding source variants and allow additional language categories', () => {
  const report = auditFiles([catalog({ items: { localizations: {
    en: { variations: { plural: { one: unit('%lld item'), other: unit('%lld items') } } },
    pl: { variations: { plural: { one: unit('%lld rzecz'), few: unit('%lld rzeczy'), many: unit('%lld rzeczy'), other: unit('%lld rzeczy') } } },
    nb: { variations: { plural: { one: unit('%lld ting') } } },
  } } })]);
  assert.equal(report.entries[0].translations.pl.length, 4);
  assert.equal(report.issues.filter((issue) => issue.type === 'placeholder').length, 0);
  assert.equal(report.issues.filter((issue) => issue.type === 'missing-variant').length, 1);
  assert.deepEqual(report.locales.map(({ code, translated }) => ({ code, translated })), [{ code: 'nb', translated: 0 }, { code: 'pl', translated: 1 }]);
});

test('nested device/plural and substitution strings are extracted with honest unsupported coverage', () => {
  const complex = { variations: { device: { iphone: { variations: { plural: { other: unit('%lld ting') } } } } } };
  const report = auditFiles([catalog({
    '%lld things': { localizations: { nb: complex } },
    '%#@count@ things': { localizations: { nb: { substitutions: { count: { argNum: 1, formatSpecifier: 'lld', variations: { plural: { other: unit('%lld ting') } } } } } } },
    '{count, plural, one {# item} other {# items}}': { localizations: { nb: unit('{count, plural, one {# ting} other {# ting}}') } },
  })]);
  assert.equal(report.entries[0].translations.nb.length, 1);
  assert.ok(report.issues.some((issue) => issue.type === 'unsupported'));
  assert.ok(report.issues.some((issue) => issue.type === 'unsupported-format'));
  assert.equal(report.summary.coverage, 0);
});

test('unknown variation axes and translation-bearing subtrees cannot receive full coverage', () => {
  for (const localization of [
    { variations: { futureAxis: { foo: unit('Hei') } } },
    { futureStructure: { greeting: unit('Hei') } },
  ]) {
    const report = auditFiles([catalog({ Hello: { localizations: { nb: localization } } })]);
    assert.ok(report.issues.some((issue) => issue.type === 'unsupported'));
    assert.equal(report.summary.coverage, 0);
  }
});

test('fixed plural forms may spell out one numeric count, while other arguments stay checked', () => {
  const report = auditFiles([catalog({
    '%lld items': { localizations: { nb: { variations: { plural: { one: unit('Ett element'), other: unit('%lld elementer') } } } } },
    '%lld items for %@': { localizations: { nb: { variations: { plural: { one: unit('Ett element'), other: unit('%lld elementer for %@') } } } } },
  })]);
  assert.equal(report.issues.filter((issue) => issue.type === 'plural-count').length, 1);
  assert.equal(report.issues.filter((issue) => issue.type === 'placeholder').length, 1);
  assert.equal(report.issues.find((issue) => issue.type === 'placeholder').key, '%lld items for %@');
});

test('a numeric count may be restored when the source singular spells it out', () => {
  const report = auditFiles([catalog({ Count: { localizations: {
    en: { variations: { plural: { one: unit('One item'), other: unit('%lld items') } } },
    nb: { variations: { plural: { one: unit('%lld element'), other: unit('%lld elementer') } } },
  } } })]);
  assert.equal(report.summary.errors, 0);
  assert.equal(report.issues[0].type, 'plural-count');
  assert.equal(report.summary.coverage, 100);
});

test('missing complex variants are manual edits and source-only files have no target coverage', () => {
  const report = auditFiles([catalog({ Count: { localizations: { en: { variations: { plural: { one: unit('%lld item'), other: unit('%lld items') } } } } } })], { targetLocales: ['nb'] });
  assert.equal(report.issues[0].fixable, false);
  assert.equal(report.issues[0].path, null);
  assert.equal(auditFiles([catalog({ Hello: {} })]).summary.coverage, 0);
});

test('stale records are advisory and deterministic issue IDs survive reimport', () => {
  const files = [catalog({ Old: { extractionState: 'stale', localizations: { nb: unit('Gammel') } } })];
  const first = auditFiles(files);
  assert.equal(first.issues[0].type, 'stale');
  assert.equal(first.issues[0].severity, 'info');
  assert.equal(first.summary.coverage, 100);
  assert.deepEqual(first.issues.map((issue) => issue.id), auditFiles(files).issues.map((issue) => issue.id));
});

test('repairs preserve unknown catalog metadata, update only selected leaf and mark translated', () => {
  const files = [catalog({
    'Hello %@': { comment: 'Greeting', futureField: { retained: true }, localizations: {
      en: unit('Hello %@'), nb: { ...unit('Hei %d', 'needs_review'), futureLocaleField: 42 }, es: unit('Hola %@'),
    } },
  }, { futureRoot: ['keep', 'me'] })];
  const original = structuredClone(files);
  const issue = auditFiles(files).issues.find((issue) => issue.type === 'placeholder');
  const updated = updateTranslation(files, issue, 'Hei %@');
  const data = JSON.parse(updated[0].text);
  assert.deepEqual(files, original);
  assert.deepEqual(data.futureRoot, ['keep', 'me']);
  assert.deepEqual(data.strings['Hello %@'].futureField, { retained: true });
  assert.equal(data.strings['Hello %@'].localizations.nb.futureLocaleField, 42);
  assert.deepEqual(data.strings['Hello %@'].localizations.es, unit('Hola %@'));
  assert.equal(data.strings['Hello %@'].localizations.nb.stringUnit.state, 'translated');
  assert.equal(auditFiles(updated).issues.filter((finding) => finding.locale === 'nb').length, 0);
});

test('repairs add missing catalog locales and preserve existing variation siblings', () => {
  const files = [catalog({ '%lld things': { localizations: { nb: { variations: { plural: { one: unit('%lld ting'), other: unit('%d ting') } } } } } })];
  const report = auditFiles(files, { targetLocales: ['es'] });
  const fixedVariant = updateTranslation(files, report.issues.find((issue) => issue.type === 'placeholder'), '%lld ting');
  const fixedMissing = updateTranslation(fixedVariant, report.issues.find((issue) => issue.type === 'missing'), '%lld cosas');
  const data = JSON.parse(fixedMissing[0].text);
  assert.equal(data.strings['%lld things'].localizations.nb.variations.plural.one.stringUnit.value, '%lld ting');
  assert.deepEqual(data.strings['%lld things'].localizations.es, unit('%lld cosas'));
  assert.equal(auditFiles(fixedMissing).summary.errors, 0);
});

test('locale JSON pairs nested source keys, flags target-only keys, and exports missing keys', () => {
  const files = [file('en.json', { app: { title: 'Home', hello: 'Hello {name}' }, keep: 'Keep' }), file('nb.json', { app: { hello: 'Hei {name}' }, extra: 'Ekstra' })];
  const report = auditFiles(files);
  assert.equal(report.summary.entries, 3);
  assert.equal(report.locales.length, 1);
  assert.equal(report.locales[0].code, 'nb');
  assert.equal(report.issues.filter((issue) => issue.type === 'missing').length, 2);
  assert.equal(report.issues.filter((issue) => issue.type === 'extra-key').length, 1);
  const issue = report.issues.find((issue) => issue.key === 'app.title');
  assert.equal(issue.fileName, 'nb.json');
  const fixed = updateTranslation(files, issue, 'Hjem');
  assert.deepEqual(JSON.parse(fixed[1].text), { app: { hello: 'Hei {name}', title: 'Hjem' }, extra: 'Ekstra' });
  assert.equal(auditFiles(fixed).issues.filter((issue) => issue.type === 'missing').length, 1);
});

test('explicit JSON source locale is honored and absent target file can be created', () => {
  const files = [file('translations.nb.json', { title: 'Hjem' }), file('translations.en.json', { title: 'Home' })];
  const report = auditFiles(files, { sourceLocale: 'nb', targetLocales: ['es'] });
  assert.equal(report.sourceLocale, 'nb');
  assert.equal(report.entries[0].source, 'Hjem');
  assert.equal(report.locales.some((locale) => locale.code === 'nb'), false);
  const missing = report.issues.find((issue) => issue.locale === 'es');
  assert.equal(missing.fileName, 'translations.es.json');
  const fixed = updateTranslation(files, missing, 'Casa');
  assert.equal(fixed.length, 3);
  assert.deepEqual(JSON.parse(fixed[2].text), { title: 'Casa' });
});

test('the same orphan JSON key in several languages keeps one unique entry', () => {
  const report = auditFiles([file('en.json', { title: 'Home' }), file('nb.json', { title: 'Hjem', orphan: 'En' }), file('es.json', { title: 'Casa', orphan: 'Dos' })]);
  assert.equal(new Set(report.entries.map((entry) => entry.id)).size, report.entries.length);
  const orphans = report.issues.filter((issue) => issue.type === 'extra-key');
  assert.equal(orphans.length, 2);
  assert.deepEqual(orphans.map((issue) => issue.fileName), ['nb.json', 'es.json']);
});

test('literal dotted and prototype-like JSON keys retain their exact paths safely', () => {
  const source = { name: 'en.json', text: '{"__proto__":{"label":"Hello"},"a.b":"World"}' };
  const target = file('nb.json', {});
  let files = [source, target];
  for (const issue of auditFiles(files).issues) files = updateTranslation(files, issue, 'Oversatt');
  assert.deepEqual(JSON.parse(files[1].text), JSON.parse('{"__proto__":{"label":"Oversatt"},"a.b":"Oversatt"}'));
  assert.equal({}.label, undefined);
});

test('JSON repairs reject object, array and primitive collisions without losing existing data', () => {
  for (const existing of [{ legacy: 'Behold' }, ['Behold'], null, 42, false]) {
    const files = [file('en.json', { title: 'Home' }), file('nb.json', { title: existing })];
    const before = structuredClone(files);
    const missing = auditFiles(files).issues.find((issue) => issue.type === 'missing');
    assert.throws(() => updateTranslation(files, missing, 'Hjem'), /non-string value/);
    assert.deepEqual(files, before);
  }
  const files = [file('en.json', { page: { title: 'Home' } }), file('nb.json', { page: 'Existing text' })];
  assert.throws(() => updateTranslation(files, auditFiles(files).issues.find((issue) => issue.type === 'missing'), 'Hjem'), /non-object value/);
});

test('catalog repairs reject malformed string-unit values instead of overwriting unknown data', () => {
  const files = [catalog({ Hello: { localizations: { nb: { stringUnit: { value: { unknown: true }, state: 'new' } } } } })];
  const before = structuredClone(files);
  const missing = auditFiles(files).issues.find((issue) => issue.type === 'missing');
  assert.equal(missing.fixable, false);
  assert.throws(() => updateTranslation(files, missing, 'Hei'), /manual edit/);
  assert.throws(() => updateTranslation(files, { ...missing, fixable: true }, 'Hei'), /non-string value/);
  assert.deepEqual(files, before);
});

test('malformed catalog states stay safe to render and require manual metadata review', () => {
  const report = auditFiles([catalog({ Hello: { localizations: { nb: unit('Hei', { future: true }) } } })]);
  assert.equal(report.entries[0].translations.nb[0].state, 'unknown');
  assert.equal(report.issues[0].type, 'review');
  assert.equal(report.issues[0].fixable, false);
  assert.equal(report.summary.coverage, 0);
});

test('malformed and unsupported files report errors without stopping valid files', () => {
  const report = auditFiles([
    { name: 'broken.xcstrings', text: '{' }, file('root.json', { en: { hello: 'Hello' } }),
    file('en.json', { good: 'Hello', ignored: [1, 2] }), file('nb.json', { good: 'Hei' }),
  ]);
  assert.equal(report.errors.length, 3);
  assert.equal(report.summary.entries, 1);
  assert.equal(report.summary.coverage, 100);
});
