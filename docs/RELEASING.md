# Releasing Stringlight

The GitHub repository is the canonical public source. GitHub Releases distribute a standard npm tarball; npm-registry publication is a separate, optional step and is not automated.

1. Update the package version and changelog, then regenerate the lockfile with `npm install --package-lock-only`.
2. Run `npm ci`, `npm test`, `npm run build`, and `npm run verify:package`. The last command packs the actual distributable, installs it into a fresh consumer without network dependencies, and exercises the executable, exports, examples, repairs, and types.
3. Commit the source. Wait for the repository's Node 22 and 24 CI jobs to pass.
4. Create and push an annotated version tag matching `package.json`, such as `v0.1.0`.
5. Run `npm pack --pack-destination artifacts` and attach the resulting `.tgz` to a GitHub Release for that exact tag. The `artifacts/` directory is ignored by Git.
6. Download and install the published asset into a fresh project, then verify `npx stringlight --version` and an example audit. A public release should link the exact tag and package asset.

The CLI and library package has no runtime dependencies. React/Vite and test tooling remain development-only dependencies for the source checkout. Do not add install or prepare hooks that make ordinary library consumers build the browser UI.

For changes to audit behavior, add a minimal synthetic regression fixture and preserve unrelated catalog data. Broaden supported syntax only when the parser can verify it; otherwise retain a manual-review finding.

## Browser workbench hosting

The browser build is a static Vite bundle in `dist/`. Serve it with any static host. The developer's ignored local `.openai/hosting.json` binds their separate private Sites preview; it is excluded from public source and the npm tarball. A fork using Sites needs its own project identity. Changing the GitHub release does not automatically redeploy that separate preview.

The original private-preview development history is retained locally on the `sites-preview` branch. Only the clean public `main` branch and public release tags are pushed to GitHub.
