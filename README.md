# Stringlight

A private localization preflight workbench for app makers. Import a string catalog, see what needs attention, fix translations in context, and export your work.

Stringlight is for the moment before a release when a catalog looks nearly finished but a missing translation, changed placeholder, or unreviewed string can still slip through. The app runs in your browser and does not require an account, API key, or translation subscription.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The other scripts are:

| Command | Purpose |
| --- | --- |
| `npm test` | Run the localization engine and CLI tests with Node's test runner |
| `npm run build` | Create the static production bundle in `dist/` |
| `npm run preview` | Serve that production bundle locally |

## Terminal and CI

The same audit engine runs directly in Node without installing dependencies:

```sh
node scripts/audit.mjs Localizable.xcstrings
node scripts/audit.mjs en.json fr.json --source en --target de
node scripts/audit.mjs en.json fr.json --format markdown --out audit.md
node scripts/audit.mjs --help
```

JSON is written to stdout by default. Use `--format markdown` for a readable report, or `--out <path>` to write either format to a file. Input names in the report are basenames. `--target` can be repeated to require languages that are absent from all inputs. Use `--` before input paths beginning with a dash.

The command leaves localization inputs unchanged and refuses an output path that matches an input, including an existing symbolic or hard link to that file. No report file is written unless `--out` is supplied.

| Exit code | Meaning |
| --- | --- |
| `0` | No error findings; warnings and informational suggestions may remain |
| `1` | At least one diagnostic error, such as a missing translation or mismatched placeholder |
| `2` | Invalid usage, unreadable input/output, or an input problem such as malformed JSON or unsupported non-string data |

An audit with input problems still emits its available report when parsing can continue. Usage and filesystem failures are explained on stderr. A successful exit is a useful CI check, not a guarantee of translation quality or release success.

## Try a complete workflow

1. Load the clearly labeled **Wayfarer** demo, or import your own localization files.
2. Review **Strings passing checks** by language and filter the findings to one language or priority.
3. Open a finding to compare the source and translation, then save a correction.
4. Download the audit report or export your edited localization files.

Wayfarer is a fictional travel app with deliberately seeded problems. Its translations and counts demonstrate the product; they are not customer data or evidence of market demand. The demo includes a real plural structure, an excluded internal string, and an intentionally unchanged brand name.

## Supported inputs

- **Apple `.xcstrings` catalogs:** a JSON catalog containing `sourceLanguage`, `strings`, and per-language localizations. String units carry their values and translation states. The source language can fall back to the catalog key when its value is omitted.
- **JSON locale files:** one locale per file, such as `en.json`, `nb.json`, or `common.es.json`, using string values in a flat or nested object. Import the source file together with the other locales and select the source language. Audit one JSON namespace at a time; two files for the same locale and objects bundling multiple locales are not supported.

The original files are not changed on disk. Export creates new downloadable copies. Keep your originals in source control and review the diff before replacing them.

The browser accepts up to 30 files, up to 6 MB per file and 12 MB for the workspace. Larger catalogs can also be audited locally with the CLI.

## What the checks mean

- **Missing or empty:** an expected translation has no usable value.
- **Placeholder mismatch:** a translation changes the arguments expected by a source string, such as dropping `%@` or replacing it with `%d`.
- **Translation state:** a catalog entry marked `new` or `needs_review` still needs attention. These are catalog states, not judgments about the meaning of the translation.
- **Review suggestions:** identical source/target text or unexpected whitespace can be useful to inspect. Brand names and some short words may correctly stay identical.

The **Strings passing checks** percentage counts keys without blocking errors or outstanding translation/format review; whitespace and same-source suggestions do not reduce it. Strings marked `shouldTranslate: false` are excluded. This metric describes checks on the imported catalog, not language quality or every user-facing surface in your app. Reports retain the underlying numeric field name `coverage` for compatibility. A locale absent from every imported file must be requested explicitly, such as with CLI `--target de`.

Passing these checks does not establish linguistic accuracy, cultural suitability, text fit, accessibility, or runtime correctness. Build and test the app in its supported languages. Stringlight does not scan source code for hardcoded text and does not certify App Store approval.

## Privacy and storage

In the browser workflow, catalog parsing, analysis, editing, and export happen in the browser. The CLI reads and audits files locally. Imported translation contents are not sent to a server or an external AI service. The built app is a static site and needs no backend or paid API.

Exactly one workspace is saved in local browser storage. Importing a new workspace or resetting to the sample replaces that saved workspace; export current files before doing either. It is not encrypted team storage, a backup, or a synchronization service. Clearing site data removes saved browser data. On a shared device, clear the workspace after handling private catalogs.

A workspace can fit the import limits yet exceed the browser's storage quota. If a **Not saved** warning appears, your current work remains in memory but may not survive closing the page. Export the files before closing.

## Format limitations

Stringlight is a deterministic preflight tool, not a complete implementation of every localization runtime. JSON locale detection depends on recognizable filenames. JSON arrays, numbers, booleans, and null values remain unchanged and are reported for manual inspection; only string values within objects are audited. Literal dotted keys and nested key paths are kept distinct.

Placeholder checks cover common Foundation/printf arguments and simple named placeholders such as `{name}` and `{{name}}`; these two syntaxes are kept distinct. Valid positional argument reordering is supported, and `%%` is treated as a literal percent sign. ICU messages and named Apple `%#@…@` substitution formats explicitly require manual format review. Rich-text markup, arbitrary formatter conventions, and language-specific grammatical correctness are outside this audit.

Apple plural and device variation leaves are extracted. Device variants, nested variation axes, and substitutions receive an explicit warning because Stringlight cannot prove their complete coverage. Missing an entire locale for a varied source requires a manual repair rather than inserting an unvaried translation. Basic plurals are checked for an `other` fallback; this does not prove that every language-specific category has been supplied. A fixed plural form may legitimately spell out a number instead of repeating the numeric placeholder; this is a review suggestion. Unknown metadata is preserved when editing translation values; source-control review remains the final check.

## Development verification

Two existing catalogs were audited locally without uploading their contents or adding them to this repository:

| Catalog size | Keys | Target locales | Local Node audit time |
| --- | --- | --- | --- |
| 898,624 bytes | 1,415 | 2 | 22.08 ms |
| 4,195,836 bytes | 1,102 | 19 | 81.69 ms |

These are single local measurements excluding file I/O, not browser benchmarks. Both parsed without input errors or blocking findings. Suggestions were dominated by short same-source text, which may be valid names or shared words. Six complex substitution entries in the larger catalog received explicit manual-review warnings across its 19 locales. No linguistic review or runtime app validation is implied.

## Research behind the product

These are primary references checked on October 22, 2026. They establish the workflow and format behavior, not demand for this particular product.

- [Apple: Localizing and varying text with a string catalog](https://developer.apple.com/documentation/Xcode/localizing-and-varying-text-with-a-string-catalog) — language coverage, translation states, plurals, and device variants.
- [Apple: Discover String Catalogs, WWDC23](https://developer.apple.com/videos/play/wwdc2023/10155/) — catalog JSON, default-value fallback, manual strings, stale entries, review states, and substitutions.
- [Apple: String Format Specifiers](https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/Strings/Articles/formatSpecifiers.html) — Foundation formatting arguments and positional specifiers.
- [Apple: Stringsdict file format](https://help.apple.com/xcode/mac/current/en.lproj/devaf8b4090a.html) — language-dependent plural categories and numeric placeholders. This documents the older runtime format; it is not a complete `.xcstrings` JSON schema.
- [Localazy: QA Checks](https://localazy.com/docs/general/qa-checks) — existing localization QA practice, including placeholders and whitespace. Similar checks already exist in translation platforms.

## Product hypothesis and launch

The hypothesis is that independent makers want a fast, private review step without moving their catalogs into a translation management system. The proposed distinction is an immediate import → understandable finding → correction → export workflow. Translation QA itself is established functionality.

Start with the free working utility, demonstrate one real correction, and invite 20 independent app developers to try their own catalogs. Track voluntary feedback on false positives and whether they would use it for the next release.

**Initial success metric:** at least 10 of the first 20 external users who import a valid catalog export a corrected catalog or actionable report in the same session. This is a target for validation; no external adoption, revenue, or commercial success is claimed.
