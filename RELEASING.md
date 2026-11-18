# Releasing @edubeam/plot

This file is for maintainers and is not part of the published package.

Releases are published to npm by GitHub Actions (`.github/workflows/release.yml`) when a version tag is pushed. The
workflow authenticates with npm **trusted publishing** (OIDC), so no npm token is stored anywhere. Each release is
published with **provenance**: a signed statement, shown on npmjs.com, of which repository, commit and workflow
built it.

## One-time setup

1. **The repository.** Create `EduBeamApp/plot` on GitHub and push `main`. `package.json` already names it in
   `repository` and `bugs`. npm checks that `repository.url` matches the repository the workflow runs in when it
   publishes with provenance, so keep the two in agreement.
2. **The first publish, by hand.** npm sets up a trusted publisher in a package's settings on npmjs.com, so the
   package has to exist first. At the time of writing (npm's documentation, 2025), npm cannot register a trusted
   publisher for a package name that has never been published, unlike PyPI's "pending publishers". So publish 0.1.0
   once from your machine, as an owner of the `@edubeam` organisation:

   ```sh
   npm login
   npm publish --access public   # prepublishOnly runs typecheck, tests and build first
   ```

   This first version has no provenance; every release from the workflow will. If npm has since added a way to set up
   a trusted publisher for a package that doesn't exist yet, use that instead, and let the workflow publish 0.1.0.

3. **The trusted publisher.** On npmjs.com, open the package, then **Settings** → **Trusted publishing**, and add a
   GitHub Actions publisher:

   | Field        | Value         |
   | ------------ | ------------- |
   | Organization | `EduBeamApp`  |
   | Repository   | `plot`        |
   | Workflow     | `release.yml` |
   | Environment  | leave empty   |

4. **Optional hardening.** In the same settings, once the workflow has published a release, set publishing access to
   require two-factor authentication and disallow tokens. Then only the workflow, or an owner with 2FA, can publish.

## Releasing a version

1. Make sure `main` is green in CI.
2. Bump the version without tagging yet, so you can edit the changelog first:

   ```sh
   npm version 0.2.0 --no-git-tag-version
   ```

3. In `CHANGELOG.md`, turn the "unreleased" heading into the version and date, for example `## 0.2.0 (2027-01-15)`,
   and list the changes.
4. Commit both files, tag the commit with `v` plus the version, and push the commit and the tag:

   ```sh
   git commit -am "release: 0.2.0"
   git tag v0.2.0
   git push origin main v0.2.0
   ```

5. The **Release** workflow runs on the tag. It fails without publishing if the tag doesn't equal `v` + the version
   in `package.json`, or if the typecheck, the tests or the build fail. To retry after a fix, delete the tag
   (`git push --delete origin v0.2.0`, `git tag -d v0.2.0`), fix it, and tag again. A version that reached npm can't
   be published again, so bump to the next patch instead.

## Checking provenance

- On the package page, <https://www.npmjs.com/package/@edubeam/plot>, a published version with provenance shows a
  **Provenance** section, with a check mark, near the bottom of the page. It names the repository, the commit and the
  workflow run that built it, and links to the public transparency log entry (Sigstore).
- From a terminal, in any project that installs the package:

  ```sh
  npm audit signatures
  ```

  It reports the packages with verified registry signatures and verified attestations, `@edubeam/plot` among them.
