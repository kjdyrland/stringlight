# Library API

Install the pinned GitHub release as described in the README. The package is ESM, ships TypeScript declarations, and has no runtime dependencies. The React workbench is developed from a full repository checkout; it is not required by the library or CLI.

```js
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { auditFiles, updateTranslation, placeholders } from '@kjdyrland/stringlight';

const files = [{
  name: 'Localizable.xcstrings',
  text: await readFile('./App/Localizable.xcstrings', 'utf8'),
}];

const report = auditFiles(files, { targetLocales: ['nb', 'es'] });
console.log(report.summary);
```

## `auditFiles(files, options?)`

Each input is `{ name: string, text: string }`. Names identify destinations and must be unique. Use `.xcstrings` for an Apple catalog or language filenames such as `en.json`, `nb.json`, and `common.es.json` for JSON. Audit one JSON namespace at a time. Apple catalogs carry their own source language. Set `sourceLocale` for JSON (default `en`). Add `targetLocales` to require languages that are completely absent from the inputs.

This synchronous, pure function does not read files, contact a server, or mutate inputs. In a browser, obtain text with `await file.text()`.

The result contains:

| Field | Meaning |
| --- | --- |
| `errors` | Input problems, including malformed JSON or unsupported non-string JSON values. Check this even when `issues` is empty. |
| `issues` | Findings with deterministic ID, severity, type, source/target text, file, locale, JSON path, and repair eligibility. |
| `entries` | Normalized source keys and target string units, with comments and variant paths. |
| `locales` | Per-language counts and percentage of strings passing supported checks. |
| `summary` | Active entries, locales, findings, errors, warnings, and the numeric `coverage` percentage. |
| `sourceLocale`, `sourceLocales` | The first and complete set of source languages represented by the inputs. |
| `files`, `catalogs` | Normalized file metadata and the detected catalogs. |

For a pipeline failure, check `report.errors.length > 0` and your chosen severity threshold. Informational same-source findings may be correct names or shared words. Warnings about ICU or complex catalog structures mean their completeness was not verified.

For JSON, an entry's `fileName` identifies its source file, while a finding's `fileName` identifies the target repair destination. Use the finding directly for repairs; do not combine an entry's source filename with a target path.

The report's `coverage` field is the UI's **Strings passing checks** measure. It is not a language-quality score, translation-platform certification, or release guarantee.

## `updateTranslation(files, finding, value)`

Only use findings with `fixable === true`. This function rejects manual-only findings. It returns a new array of file copies and never writes to disk. Existing unknown JSON properties and unrelated string units are retained; serialization may change whitespace. An Apple string unit that is explicitly saved is marked `translated`. A missing JSON locale may create another output file.

```js
const finding = report.issues.find(issue =>
  issue.type === 'missing' && issue.locale === 'nb' && issue.fixable
);

if (finding) {
  const revisedFiles = updateTranslation(files, finding, 'Your reviewed translation');
  // Re-audit, present a diff, and save to a new destination for human review.
  const revised = auditFiles(revisedFiles, { targetLocales: ['nb', 'es'] });
  await mkdir('./reviewed', { recursive: true });
  for (const file of revisedFiles) {
    await writeFile(`./reviewed/${file.name}`, file.text);
  }
}
```

Keep automatic repairs out of unattended release checks. A caller should use a finding from the current report, not an old finding after the files have changed. Object/array/scalar path collisions are rejected to avoid overwriting unrelated data. Keep original files in source control and review the diff.

## `placeholders(value)`

Returns `{ tokens: string[], unsupported: boolean }` for common Foundation/printf arguments and simple `{name}` / `{{name}}` placeholders. The two named syntaxes stay distinct. Explicit positional reordering is accepted; `%%` is a literal percent sign. ICU and Apple named substitution formats return `unsupported: true` and require a format-aware review.

```js
placeholders('Hello %@, you have %lld messages');
// { tokens: ['1:@', '2:lld'], unsupported: false }
```

This helper describes the scanner's supported syntax. It does not validate a translation runtime or perform an ICU parse.
