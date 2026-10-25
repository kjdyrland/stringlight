# Changelog

## 0.1.1 — 2026-10-25

### Fixed

- Read Apple App Shortcut `stringSet.values` alternatives instead of reporting valid translated phrase sets as missing.
- Check every phrase's text, placeholders and shared translation state without requiring matching phrase counts or array order between languages.
- Distinguish `${name}` markers from `{name}` so lost App Shortcut dollar signs cannot pass placeholder checks.
- Repair existing phrase-array elements while preserving siblings and metadata. Editing one phrase in a multi-phrase set retains its shared review state; absent or malformed sets remain manual repairs.

### Verification

Synthetic phrase-set regressions and a packed-package fresh-consumer check cover different phrase counts, source argument alternatives, precise repair paths, state preservation and malformed input. Private application catalogs are never included in the package or fixtures.

## 0.1.0 — 2026-10-22

First public release of Stringlight, a local localization review tool in an established category.

### Added

- Browser import and review for Apple `.xcstrings` catalogs and flat/nested JSON locale files.
- Missing/empty translation checks, translation-state review, common placeholder checks, and whitespace/same-source suggestions.
- Explicit manual-review findings for complex variants, substitutions, ICU messages, and other unsupported structures.
- Side-by-side editing, corrected-file downloads, and JSON/Markdown audit reports.
- One saved browser workspace, a fictional Wayfarer sample, and visible storage-recovery/quota feedback.
- A shared ESM audit/repair API and `stringlight` CLI with source/target options, severity thresholds, JSON/Markdown reports, version/help output, and CI exit codes.
- Synthetic fixtures, regressions, spawned-process CLI tests, integration examples, and MIT licensing.

### Distribution

The package is named `@kjdyrland/stringlight`. Install from the `v0.1.0` GitHub tag; it is not published to the npm registry.

### Known limits

Checks do not establish linguistic quality, complete CLDR coverage, runtime layout, or release approval. Complex Apple variations and ICU messages need manual review. JSON input is one object-based locale file per language and namespace. See the [README](README.md#current-limits) for details.
