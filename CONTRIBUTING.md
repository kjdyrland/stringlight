# Contributing to Stringlight

Bug reports, focused fixes, and clearer documentation are welcome. Stringlight is an early project with a deterministic audit engine and a browser review workspace. Similar localization tools already exist; a proposed change should explain the concrete workflow or failure it improves.

## Report a problem

Open a [GitHub issue](https://github.com/kjdyrland/stringlight/issues) with:

- The Stringlight version, Node version or browser, and relevant command or UI steps.
- Expected and actual behavior, including the exit code for CLI problems.
- A minimal synthetic localization file reproducing the issue.

Replace private translations, identifiers, personal data, and credentials before posting. A full private catalog is not needed. For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of posting sensitive details publicly.

## Develop locally

```sh
git clone https://github.com/kjdyrland/stringlight.git
cd stringlight
npm ci
npm test
npm run dev
```

Requires Node.js 22.13+. Run `npm run build` before submitting browser changes and use `npm run preview` to inspect the built app. Exercise import → inspect → edit → export with Wayfarer or synthetic fixtures.

| Path | Responsibility |
| --- | --- |
| `src/audit.js` | File-content parsing, diagnostics, and translation repairs. |
| `scripts/audit.mjs` | Local CLI, reports, arguments, and exit codes. |
| `src/App.jsx` | Browser workspace and review UI. |
| `src/demo.js` | Fictional Wayfarer catalog with deliberately seeded issues. |
| `tests/` | Engine regressions and spawned-process CLI tests. |

## Submit a pull request

Keep the change focused and explain the failing case and resulting behavior. For parser or repair fixes, add a regression test using a small synthetic example and verify that unrelated metadata survives. Prefer observable behavior over tests that repeat the implementation.

Before opening the pull request:

```sh
npm test
npm run build
```

For UI changes, include a screenshot and describe the browser workflow checked. For format changes, document supported cases and remaining manual review. Update the API documentation or README when a public contract changes.

Keep the engine deterministic and usable in both Node and browsers. Do not add network calls to local auditing, silently rewrite unsupported structures, or present advisory findings as proven translation defects. Discuss major new formats or dependencies before implementing them.

Do not commit private app catalogs, private audit reports, credentials, `node_modules/`, or generated production bundles. Use files you are authorized to share and retain relevant third-party license notices.

Contributions are provided under the project's [MIT license](LICENSE).
