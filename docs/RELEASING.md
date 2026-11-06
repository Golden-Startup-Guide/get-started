# Releasing

## Versions

The Personal Knowledge Library uses [semantic versioning](https://semver.org/): `major.minor.patch`.

- **Patch** (1.0.1): fixes only.
- **Minor** (1.1.0): new features that need nothing from the user.
- **Major** (2.0.0): a change people must know about, such as a new backup format
  that older versions cannot import.

A new database version (`DATABASE_VERSION`) is not by itself a major version:
upgrades are automatic and tested (`src/test/databaseFixtures`). Capture a sample of
the new version (`npm run fixtures:capture`) before releasing it.

## How a release is made

1. Make sure `main` is green.
2. On a branch, update `version` in `package.json` (and `package-lock.json`, with
   `npm version <new> --no-git-tag-version`), and move the changes into a new
   `## [x.y.z] - YYYY-MM-DD` section at the top of `CHANGELOG.md`.
3. Open a pull request, and merge it once CI passes. The Deploy workflow publishes
   the site, and installed apps offer the update with their **Update available**
   banner.
4. Tag the merge commit and push the tag:
   `git tag vX.Y.Z <commit> && git push origin vX.Y.Z`. The Release workflow
   checks the tag matches `package.json`, builds, and publishes a GitHub release
   with that version's changelog section and a zip of the built app.

## Dependencies

Dependabot opens pull requests every Monday: minor and patch npm updates grouped
into one, major updates one by one, and GitHub Actions monthly. Each runs the full
CI, including the end-to-end, accessibility, size, and Lighthouse checks, and is
merged like any other change. CI fails on any high-severity advisory in the
dependencies that ship (`npm audit --omit=dev`).

## Error reporting

The Personal Knowledge Library sends no error reports and has no analytics. Instead, **Settings → About
→ Problems** lists the errors seen since the app opened (messages shown to the
user, and uncaught errors), kept in memory only. **Copy details** puts the version,
browser, language, and those messages on the clipboard for an issue the user
chooses to open. This keeps the promise in [PRIVACY.md](../PRIVACY.md): nothing
leaves the device unless the user sends it.
