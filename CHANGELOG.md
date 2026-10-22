# Changelog

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
