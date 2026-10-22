import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { auditFiles, updateTranslation } from '../src/audit.js';

test('library repairs enforce manual-only findings without changing their inputs', () => {
  const files = [{ name: 'Localizable.xcstrings', text: JSON.stringify({
    sourceLanguage: 'en', version: '1.0', strings: { count: { localizations: {
      en: { variations: { plural: { other: { stringUnit: { value: '%lld items', state: 'translated' } } } } },
    } } },
  }) }];
  const original = JSON.stringify(files);
  const report = auditFiles(files, { targetLocales: ['nb'] });
  const issue = report.issues.find(item => item.type === 'missing');
  assert.equal(issue.fixable, false);
  assert.throws(() => updateTranslation(files, issue, '%lld ting'), /manual edit/);
  assert.equal(JSON.stringify(files), original);
});

test('documented example files audit successfully; broken example produces actionable failures', async () => {
  const load = async path => ({ name: path.split('/').at(-1), text: await readFile(new URL(`../examples/${path}`, import.meta.url), 'utf8') });
  const apple = auditFiles([await load('apple/Localizable.xcstrings')], { targetLocales: ['nb', 'es'] });
  assert.equal(apple.errors.length, 0);
  assert.equal(apple.summary.errors, 0);
  const json = auditFiles(await Promise.all(['json/en.json', 'json/nb.json'].map(load)));
  assert.equal(json.errors.length, 0);
  assert.equal(json.summary.errors, 0);
  const broken = auditFiles([await load('broken/Localizable.xcstrings')], { targetLocales: ['nb'] });
  assert.ok(broken.issues.some(issue => issue.type === 'placeholder'));
  assert.ok(broken.issues.some(issue => issue.type === 'missing'));
});
