# My Notes - Code and Data-Safety Audit

**Date:** 2026-10-31
**Scope:** All source code, IndexedDB storage layer, backup/import, build, tests, dependencies, and documentation at commit `b1b005d`.

## Summary

The baseline is solid: strict TypeScript compiles cleanly, the production build succeeds (~125 KB gzipped JS), all 27 tests pass, and production dependencies have 0 known vulnerabilities. However, the audit found several data-safety problems. The two most serious (findings 1 and 7) were reproduced with a temporary test.

| # | Severity | Finding |
|---|----------|---------|
| 1 | High | Backups can become impossible to restore (reproduced) - **Fixed** |
| 2 | High | Note history grows without limit |
| 3 | High | Export fails above 40 MiB while storage is unlimited |
| 4 | High | Autosave cost grows with total data size |
| 5 | High | Last edits lost on tab close, reload, or link navigation |
| 6 | High | Persistent storage is never requested - **Fixed** |
| 7 | Medium | Checklist toggles the wrong item (reproduced) |
| 8 | Medium | Restoring a revision of a trashed note silently un-trashes it |
| 9 | Medium | Restoring a revision reverts notebook, tags, pin, and favorite |
| 10 | Medium | No multi-tab handling |
| 11 | Medium | Remote Markdown images and no Content Security Policy |

## High severity

### 1. Backups can become impossible to restore (reproduced)

**Steps:** edit a note (this saves a history snapshot recording its notebook), move the note to another notebook, then delete the original notebook.

- **Why:** `deleteNotebook` only rewrites history for notes *currently* in the deleted notebook (`src/lib/notes.ts:661-674`). Older snapshots keep pointing at the deleted notebook.
- **Result:** backup validation rejects any history entry that points at a missing notebook (`src/lib/notes.ts:1074-1078`), and import is all-or-nothing. Importing the backup fails with *"This backup contains invalid, duplicate, or unsupported records."* on any device, including a fresh one.
- **Other routes to the same failure:** a note can end up pointing at a notebook that does not exist, which fails the same check (`src/lib/notes.ts:1071`):
  - Restoring such an old revision moves the note back into the deleted notebook (`src/lib/notes.ts:735`).
  - "New note" falls back to the hardcoded IDs `'starter-library'` and `'starter-personal'` (`src/App.tsx:427-438`), and `saveNote` never checks that the notebook exists.

**Recommendation:** update every history snapshot that references a deleted notebook; validate `notebookId` in `saveNote`; make import remap or skip invalid history entries instead of rejecting the whole file.

**Status: Fixed.** `deleteNotebook` now updates every history snapshot that references the deleted notebook; `saveNote` always stores an existing notebook; "New note" and the editor no longer fall back to a missing notebook; and import reassigns notes and history with missing notebooks instead of rejecting the file, so backups exported before the fix also restore.

### 2. Note history grows without limit

`saveNote` stores a full copy of the note whenever the title or content changes (`src/lib/notes.ts:254`). Autosave fires after 650 ms of inactivity, so an hour of writing can create hundreds of snapshots. Nothing prunes them.

**Recommendation:** coalesce snapshots (for example, at most one per note every few minutes) and cap the number kept per note.

### 3. Export fails above 40 MiB while storage is unlimited

Export throws above 40 MiB (`src/lib/notes.ts:855`). Attachments grow by about a third when Base64-encoded into the backup, and history grows as in finding 2. A heavy user eventually cannot back up at all, and there is no option to export without attachments or history.

**Recommendation:** offer partial exports (without attachments and/or history), or a multi-file/ZIP export.

### 4. Autosave cost grows with total data size

Every save:

- re-reads every note to rebuild tag counts (`src/lib/notes.ts:179`);
- reads every attachment's binary data just to sum sizes, and serializes all notes and history (`src/lib/notes.ts:1326-1335`, called from `src/App.tsx:416`).

With large attachments, typing becomes noticeably slow.

**Recommendation:** update tag counts incrementally; compute storage stats from attachment metadata only, and only when Settings is open.

### 5. Last edits lost on tab close, reload, or link navigation

- There is no `beforeunload` or `pagehide` handler, so up to 650 ms of typing, plus any in-flight save, is lost when the tab closes or reloads.
- Links in the Markdown preview and the logo link (`src/App.tsx:737`) navigate the app's own tab away, with the same loss.

**Recommendation:** flush the draft on `pagehide`/`visibilitychange`; open preview links in a new tab with `rel="noopener noreferrer"`.

### 6. Persistent storage is never requested

`navigator.storage.persist()` is never called. Because the browser holds the only copy of the user's notes, best-effort storage may be evicted under storage pressure; Safari also clears data for non-installed sites after 7 days without use.

**Recommendation:** request persistent storage on first save and show the result in Settings.

**Status: Fixed.** The app requests persistent storage once per session after the first successful save, and Settings shows the current status with a **Keep notes on this device** button to ask again.

## Medium severity

### 7. Checklist toggles the wrong item (reproduced)

`src/App.tsx:1757` matches rendered checkboxes to source lines by counting them in order. Task syntax inside a code block is counted but not rendered as a checkbox, so later checkboxes edit the wrong line. A `> - [ ]` task inside a blockquote shifts the mapping the other way.

**Recommendation:** use the rendered node's source position (`node.position.start.line`) instead of a counter.

### 8. Restoring a revision of a trashed note silently un-trashes it

`restoreHistory` preserves `deletedAt`, but `src/App.tsx:1595` then saves the note a second time without it. The second save is also redundant.

### 9. Restoring a revision reverts notebook, tags, pin, and favorite

Snapshots store the whole note, so restoring one reverts organization metadata as well as the title and text. Consider restoring only title and content.

### 10. No multi-tab handling

- Two open tabs silently overwrite each other's edits (last write wins).
- The database is opened without `blocked`/`blocking` handlers (`src/lib/notes.ts:65`). After a future schema upgrade, a tab still open on the old version will leave the new tab stuck on "Loading…".

**Recommendation:** add `blocking` (close and reload) and `blocked` handlers; use `BroadcastChannel` to notify other tabs of changes.

### 11. Remote Markdown images and no Content Security Policy

Images in Markdown load from the network, so a note can carry a tracking pixel. This conflicts with the "private, offline-first" claim. There is also no Content Security Policy.

## Low severity

- **Attachment blob URLs:** opening a downloaded HTML or SVG attachment's link in a new tab runs it in the app's origin, where it can read IndexedDB. This matters when importing a backup from someone else.
- **Search highlighting:** `highlight()` (`src/App.tsx:106`) recurses once per match, so a very large note searched for a single character can overflow the stack. Each note card also renders the note's full content.
- **Incorrect label:** the About section says "IndexedDB schema 4" (`src/App.tsx:1922`), but the database is version 6 (4 is the backup format version).
- **Global notebook names:** notebook names must be unique across all libraries, which may surprise users.

## Code health and tooling

- **Large files:** `src/App.tsx` is 1,929 lines, and the `App` component has about 40 state variables. `src/lib/notes.ts` is 1,347 lines. Both should be split before more features are added.
- **Dev-only vulnerabilities:** `npm audit` reports 15 (2 critical in `tinypool` via vitest 2, 1 high via the PWA plugin's build tooling). None ship to users; `npm audit --omit=dev` reports 0. Vite, Vitest, React, and `vite-plugin-pwa` are one or more major versions behind.
- **Tests:** the suite is slow (101 s total, 57 s in `src/App.test.tsx`), and no tests cover findings 1, 7, or 8.

## Strengths

- Careful use of IndexedDB transactions for multi-store operations.
- Thorough structural validation of imported backups.
- Markdown rendering does not render raw HTML, and unsafe URL schemes are blocked.
- Strong accessibility work: dialog focus trapping, ARIA attributes, keyboard-navigable radio groups.
- Tested, non-destructive schema migrations.

## Recommended fix order

1. Finding 1 - make backups always restorable.
2. Finding 6 - request persistent storage.
3. Finding 5 - flush drafts on page hide.
4. Findings 2 and 3 - prune history and offer partial exports.
5. Finding 4 - remove full-data scans from autosave.
6. Finding 7 - fix checklist mapping.
7. Finding 8 - preserve Trash state on revision restore.
