# Runnable examples

From a source checkout:

```sh
# Clean Apple catalog, including simple plural forms; exits 0.
node scripts/audit.mjs examples/apple/Localizable.xcstrings --target nb --target es

# Clean nested JSON translations; exits 0.
node scripts/audit.mjs examples/json/en.json examples/json/nb.json --source en

# Deliberately broken Apple catalog; exits 1 with missing/placeholder findings.
node scripts/audit.mjs examples/broken/Localizable.xcstrings --target nb
```

With the package installed in another project, replace `node scripts/audit.mjs` with `npx stringlight` and use that project's catalog paths.

The files are synthetic examples, not catalogs copied from an application. Do not combine the clean and broken Apple files in one invocation: filenames identify repair destinations and must be unique.
