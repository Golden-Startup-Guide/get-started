# The Personal Knowledge Library - Code and Data-Safety Audit

*Written when the app was called My Notes; it is now The Personal Knowledge Library (1.2.0). The record below is kept as it was, apart from status updates.*

**Date:** 2026-10-31
**Scope:** All source code, IndexedDB storage layer, backup/import, build, tests, dependencies, and documentation at commit `b1b005d`.

## Summary

The baseline is solid: strict TypeScript compiles cleanly, the production build succeeds (~125 KB gzipped JS), all 27 tests pass, and production dependencies have 0 known vulnerabilities. However, the audit found several data-safety problems. The two most serious (findings 1 and 7) were reproduced with a temporary test.

| # | Severity | Finding |
|---|----------|---------|
| 1 | High | Backups can become impossible to restore (reproduced) - **Fixed** |
| 2 | High | Note history grows without limit - **Fixed** |
| 3 | High | Export fails above 40 MiB while storage is unlimited - **Fixed** |
| 4 | High | Autosave cost grows with total data size - **Fixed** |
| 5 | High | Last edits lost on tab close, reload, or link navigation - **Fixed** |
| 6 | High | Persistent storage is never requested - **Fixed** |
| 7 | Medium | Checklist toggles the wrong item (reproduced) - **Fixed** |
| 8 | Medium | Restoring a revision of a trashed note silently un-trashes it - **Fixed** |
| 9 | Medium | Restoring a revision reverts notebook, tags, pin, and favorite - **Fixed** |
| 10 | Medium | No multi-tab handling - **Fixed** |
| 11 | Medium | Remote Markdown images and no Content Security Policy - **Fixed** |

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

**Status: Fixed.** `saveNote` creates a revision only when five minutes have passed since the note's latest one, and keeps at most 50 per note, pruning the oldest. Restoring a revision always records the current text first. Existing oversized histories are trimmed the next time each note gets a new revision.

### 3. Export fails above 40 MiB while storage is unlimited

Export throws above 40 MiB (`src/lib/notes.ts:855`). Attachments grow by about a third when Base64-encoded into the backup, and history grows as in finding 2. A heavy user eventually cannot back up at all, and there is no option to export without attachments or history.

**Recommendation:** offer partial exports (without attachments and/or history), or a multi-file/ZIP export.

**Status: Fixed.** Settings now has **Include attachments** and **Include history** options for export, showing how much of each is stored, and the size error suggests excluding them. Export also serializes the backup once instead of twice. A multi-file export for very large attachment collections remains possible future work.

### 4. Autosave cost grows with total data size

Every save:

- re-reads every note to rebuild tag counts (`src/lib/notes.ts:179`);
- reads every attachment's binary data just to sum sizes, and serializes all notes and history (`src/lib/notes.ts:1326-1335`, called from `src/App.tsx:416`).

With large attachments, typing becomes noticeably slow.

**Recommendation:** update tag counts incrementally; compute storage stats from attachment metadata only, and only when Settings is open.

**Status: Fixed.** Saves that change only the title or text skip the tag rebuild (tag counts are rebuilt only when a note's tags or Trash state change), and storage statistics are computed only while Settings is open.

### 5. Last edits lost on tab close, reload, or link navigation

- There is no `beforeunload` or `pagehide` handler, so up to 650 ms of typing, plus any in-flight save, is lost when the tab closes or reloads.
- Links in the Markdown preview and the logo link (`src/App.tsx:737`) navigate the app's own tab away, with the same loss.

**Recommendation:** flush the draft on `pagehide`/`visibilitychange`; open preview links in a new tab with `rel="noopener noreferrer"`.

**Status: Fixed.** The editor saves pending edits as soon as the page is hidden and on `pagehide`, and the browser asks for confirmation before closing or reloading while a change is unsaved or still saving. External preview links open in a new tab with `rel="noopener noreferrer"`; in-page footnote links are unchanged. The logo link needed no change: the editor is a modal that covers it, so it cannot be clicked with a draft open.

### 6. Persistent storage is never requested

`navigator.storage.persist()` is never called. Because the browser holds the only copy of the user's notes, best-effort storage may be evicted under storage pressure; Safari also clears data for non-installed sites after 7 days without use.

**Recommendation:** request persistent storage on first save and show the result in Settings.

**Status: Fixed.** The app requests persistent storage once per session after the first successful save, and Settings shows the current status with a **Keep notes on this device** button to ask again.

## Medium severity

### 7. Checklist toggles the wrong item (reproduced)

`src/App.tsx:1757` matches rendered checkboxes to source lines by counting them in order. Task syntax inside a code block is counted but not rendered as a checkbox, so later checkboxes edit the wrong line. A `> - [ ]` task inside a blockquote shifts the mapping the other way.

**Recommendation:** use the rendered node's source position (`node.position.start.line`) instead of a counter.

**Status: Fixed.** The preview (now `src/features/notes/MarkdownPreview.tsx`) gives each checkbox its list item's parsed source line. Checklist counts skip fenced code blocks and handle tasks inside blockquotes.

### 8. Restoring a revision of a trashed note silently un-trashes it

`restoreHistory` preserves `deletedAt`, but `src/App.tsx:1595` then saves the note a second time without it. The second save is also redundant.

**Status: Fixed.** The editor no longer saves a second time; `restoreHistory` returns the stored note.

### 9. Restoring a revision reverts notebook, tags, pin, and favorite

Snapshots store the whole note, so restoring one reverts organization metadata as well as the title and text. Consider restoring only title and content.

**Status: Fixed.** Restoring replaces only the title and text; notebook, tags, pin, favorite, and Trash state are kept. Any unsaved draft is saved first.

### 10. No multi-tab handling

- Two open tabs silently overwrite each other's edits (last write wins).
- The database is opened without `blocked`/`blocking` handlers (`src/lib/notes.ts:65`). After a future schema upgrade, a tab still open on the old version will leave the new tab stuck on "Loading…".

**Recommendation:** add `blocking` (close and reload) and `blocked` handlers; use `BroadcastChannel` to notify other tabs of changes.

**Status: Fixed.** Writes announce the notes they touched over a `BroadcastChannel`, and other tabs refresh. An open note changed elsewhere reloads automatically when it has no unsaved edits; otherwise autosave pauses and the editor offers **Keep my version** or **Load the other version**. `blocked`, `blocking`, and `terminated` events close stale connections and tell the user what to do.

### 11. Remote Markdown images and no Content Security Policy

Images in Markdown load from the network, so a note can carry a tracking pixel. This conflicts with the "private, offline-first" claim. There is also no Content Security Policy.

**Status: Fixed.** Remote images in the preview load only when clicked. Production builds include a Content Security Policy, verified in headless Chrome to load with no console errors or violations.

## Low severity

- **Attachment blob URLs:** opening a downloaded HTML or SVG attachment's link in a new tab runs it in the app's origin, where it can read IndexedDB. This matters when importing a backup from someone else. **Fixed:** files not previewed as images or audio get download-only links.
- **Search highlighting:** `highlight()` (`src/App.tsx:106`) recurses once per match, so a very large note searched for a single character can overflow the stack. Each note card also renders the note's full content. **Fixed:** highlighting is iterative (tested with 20,000 matches) and cards render at most 600 characters.
- **Incorrect label:** the About section says "IndexedDB schema 4" (`src/App.tsx:1922`), but the database is version 6 (4 is the backup format version). **Fixed:** About shows the real schema version and the backup format.
- **Global notebook names:** notebook names must be unique across all libraries, which may surprise users. **Decided (November 2026):** names stay unique, since links, imports, backups, and the Inbox, Templates, and Daily notes notebooks find notebooks by name (see [DECISIONS.md](DECISIONS.md), decision 8). The message for a name in use now says where the existing notebook is.

## Code health and tooling

- **Large files:** `src/App.tsx` is 1,929 lines, and the `App` component has about 40 state variables. `src/lib/notes.ts` is 1,347 lines. Both should be split before more features are added. **Improved:** the editor, cards, settings dialog, and helpers moved out of `App.tsx` (now about 1,140 lines), and the backup format moved to `src/lib/backupFormat.ts` (`notes.ts` is about 1,190 lines). Workspace state then moved into Zustand stores in `src/state/` (`App.tsx` is about 430 lines), which also cleared every React Compiler lint warning.
- **Dev-only vulnerabilities:** `npm audit` reports 15 (2 critical in `tinypool` via vitest 2, 1 high via the PWA plugin's build tooling). None ship to users; `npm audit --omit=dev` reports 0. Vite, Vitest, React, and `vite-plugin-pwa` are one or more major versions behind. **Improved:** Vitest 4.1.12 and `vite-plugin-pwa` 2.0.0 remove every critical and high advisory. In November 2026, npm `overrides` moved `minimatch` and `glob` onto their patched major versions (11.0.4 and 14.0.3), clearing every moderate advisory; 4 low remain, all one `deepmerge` advisory inside `workbox-build`'s build-time tooling, which has no fixed version and only merges the app's own build configuration. None ship to users. The build's large-chunk warning is now set deliberately: those chunks load on demand, and CI enforces size budgets on what users download. React 19, Vite 7+, and Tailwind 4 upgrades are left for separate, deliberate migrations.
- **Tests:** the suite is slow (101 s total, 57 s in `src/App.test.tsx`), and no tests cover findings 1, 7, or 8. **Improved:** every fixed finding has tests (52 in total), and the suite runs in about 60 s.

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

**Status:** all findings are resolved: the numbered findings and low-severity items are fixed, global notebook names are decided (and the message improved), and only a low, unfixable build-time advisory remains. `App` state has since moved into stores.
