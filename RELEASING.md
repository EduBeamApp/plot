# Releasing @edubeam/plot

This file is for maintainers and is not part of the published package.

A release is one command on a clean, up-to-date `main`:

```sh
npm run release -- patch      # or minor, major, or an exact version such as 1.4.0
```

It checks, versions, commits, tags and pushes. The tag starts `.github/workflows/release.yml`, which publishes the
package to npm with **provenance** and creates the **GitHub Release**.

## One-time setup

1. **The npm token.** The workflow publishes with `NPM_TOKEN`, a secret of the `EduBeamApp` GitHub organisation: an
   npm granular access token with read and write access to the `@edubeam` packages and "bypass 2FA" enabled. Make it
   available to the `plot` repository (organisation settings → Secrets and variables → Actions).
2. **The first publish** goes through the workflow like every other: no manual `npm publish` is needed. With the token
   in place, `npm run release -- 0.1.0` publishes 0.1.0.
3. **Optionally, trusted publishing.** Once the package exists on npm, open it on npmjs.com, then **Settings** →
   **Trusted publishing**, and add a GitHub Actions publisher:

   | Field        | Value         |
   | ------------ | ------------- |
   | Organization | `EduBeamApp`  |
   | Repository   | `plot`        |
   | Workflow     | `release.yml` |
   | Environment  | leave empty   |

   npm then authenticates the workflow by OIDC, and the token can be deleted: the publish step works without it. In
   the same settings you can also require two-factor authentication and disallow tokens, so that only the workflow, or
   an owner with 2FA, can publish.

## Releasing a version

1. Describe the changes in `CHANGELOG.md` under a heading `## x.y.z (unreleased)`, and merge everything to `main`.
2. Preview the release. This changes nothing:

   ```sh
   npm run release -- minor --dry-run
   ```

3. Release:

   ```sh
   npm run release -- minor
   ```

   `scripts/release.mjs`:
   - **refuses** unless you are on `main`, with no uncommitted changes, level with `origin/main`, and the tag does not
     exist yet
   - **runs every check**, as CI does: `npm run check` covers lint, format, typecheck, tests with coverage, build,
     publint and are-the-types-wrong
   - **sets the version** in `package.json` and `package-lock.json`
   - **dates the changelog:** turns `## x.y.z (unreleased)` into `## x.y.z (YYYY-MM-DD)`, or adds that heading when
     there is none
   - **commits** `release: vX.Y.Z`, **tags** `vX.Y.Z`, and pushes the commit and the tag together

4. The **Release** workflow runs on the tag. It fails without publishing if the tag doesn't match the version in
   `package.json`, or if any check fails. Then it publishes to npm and creates the GitHub Release, whose notes are
   the version's section of `CHANGELOG.md`.

If the workflow fails before publishing, fix the cause on `main`, delete the tag
(`git push --delete origin vX.Y.Z` and `git tag -d vX.Y.Z`), and release again. A version that reached npm can't be
published again, so release the next patch instead.

## Checking provenance

- On the package page, <https://www.npmjs.com/package/@edubeam/plot>, each version published by the workflow shows a
  **Provenance** section, with a check mark, near the bottom. It names the repository, the commit and the workflow
  run that built it, and links to the public transparency log entry (Sigstore).
- From a terminal, in any project that installs the package:

  ```sh
  npm audit signatures
  ```

  It reports the packages with verified registry signatures and verified attestations, `@edubeam/plot` among them.
