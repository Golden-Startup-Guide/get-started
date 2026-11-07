# The Personal Knowledge Library - Architecture Plan for a World-Class, AI-Free Knowledge Platform

*Written when the app was called My Notes; it is now The Personal Knowledge Library (1.2.0). The record below is kept as it was, apart from status updates.*

**Date:** 2026-10-31
**Status:** Proposed direction. Nothing here is a delivery commitment. Each major choice needs an architecture decision record (ADR) before work starts.
**Since then:** the decisions it asked for are recorded in [DECISIONS.md](DECISIONS.md) (including no AI, decision 10), and the reading-first redesign in [KNOWLEDGE_LIBRARY_PLAN.md](KNOWLEDGE_LIBRARY_PLAN.md).
**Related:** [Product roadmap](ROADMAP.md) (feature history and plans) · [Audit](AUDIT.md) (current quality baseline) · [App guide](APP_GUIDE.md) (how the app works today)

This document describes how My Notes could grow from a solid local-first notes app into one of the best personal knowledge platforms, **without using AI**. Developers and AI assistants working in this repository should read it before proposing architectural changes, and keep new work consistent with its principles.

## 1. Where the platform stands

After the audit fixes, the foundation is solid: data is protected, the app works offline, it is private and accessible, and it is well tested. The remaining limits are structural, not missing features.

| What exists today | What limits it |
|---|---|
| A plain `<textarea>` with a preview beside it | Writing feels basic next to Obsidian, Bear, or Notion |
| Search that matches exact text across every note, on every render | Slows down past a few thousand notes; no ranking, typo tolerance, or search operators |
| Links between notes are added by hand, separately from the text | People expect to type `[[Note name]]` and get a link |
| IndexedDB holds the notes, with attachment files stored inside the database | No full-text index; storage quotas and speed set the ceiling |
| One browser on one device | No sync - the biggest gap against every serious competitor |
| State now lives in Zustand stores (November 2026); storage is still per-record IndexedDB | The data layer, not the UI, now limits sync and scale |
| Real-browser tests cover core flows only (CI, ESLint, and Playwright were added in November 2026) | jsdom cannot test IndexedDB, the service worker, or the CSP for real |

## 2. The goal

**Be the fastest and most trustworthy personal knowledge library: your notes work everywhere, are readable only by you, and outlive the app.**

Without AI, platforms reach the top through craft, not feature count. Obsidian won on data ownership and plugins, Things on polish, Linear on speed, Signal on trust. My Notes should compete on four promises. Every architecture decision should serve at least one of them:

1. **It never loses your data.**
2. **It is instant at any size.**
3. **Your data stays yours:** readable only by you, in open formats, with no forced account.
4. **It runs everywhere:** web, desktop, and mobile, online or offline.

## 3. Architecture changes, by area

### A. Data foundation (first; everything else depends on it)

1. **Store every change as an operation, not an overwrite.** Today each save replaces the whole note. Instead, use a CRDT (a data structure that merges edits from several places automatically), such as **Yjs** or **Automerge**, per note and for the library structure. This one change provides:
   - multi-device sync without conflicts;
   - live merging between tabs, replacing today's "Keep my version / Load the other version" choice;
   - full version history and undo across sessions, replacing the snapshot system;
   - the basis for real-time collaboration later.
2. **Move storage to SQLite (WebAssembly) on the browser's private file system (OPFS).** This brings real indexes, transactions, and SQLite's built-in **FTS5 full-text search**, and is much faster than IndexedDB at scale. Attachments become plain files in OPFS instead of data inside the database.
3. **Put a storage interface in front of the database** and migrate gradually behind it (the "strangler" pattern). A big-bang rewrite would put user data at risk.
4. **Layer the code:** a pure TypeScript core (domain model and commands), then storage, then sync, then UI. The UI reads from stores (Zustand, or React's `useSyncExternalStore`) instead of one large component.
5. **Use open formats.** A library should export as a folder of Markdown files with YAML front matter plus attachments; a desktop vault would *be* that folder. Add importers for Obsidian, Notion, Evernote (`.enex`), Apple Notes, Google Keep, and plain Markdown folders. Easy migration in is how people switch; easy migration out is why they trust you.

### B. Sync without giving up privacy

- **End-to-end encryption:** XChaCha20-Poly1305 with keys derived from the password by Argon2id, plus a recovery key. Use libsodium - never home-grown cryptography - and have it audited before launch.
- **Bring your own storage first:** sync through a folder, WebDAV, S3, or Dropbox the user already owns. No servers, no accounts, nothing to operate.
- **Optional relay later:** a zero-knowledge relay that only ever sees encrypted operations. This is where a paid tier could come from, if wanted.
- **Accounts stay optional, forever.** The app must remain fully usable without one.

### C. The writing experience

- **Replace the text box with CodeMirror 6 in live-preview mode** (as Obsidian does). Markdown stays the source of truth, multi-megabyte notes stay smooth, and it is accessible. A ProseMirror-based editor would make Markdown files second-class, which conflicts with promise 3.
- **Typed links:** `[[wikilinks]]` with autocomplete, links derived from the text (replacing manual link records), links to specific blocks, embedded notes, and renames that update every link.
- **Rich content, loaded only when needed:** tables, math (KaTeX), diagrams (Mermaid), and code highlighting (**done**, November 2026: code highlighting, a table of contents, maths, and diagrams, each fetched on first use and kept out of the install download).
- **Keyboard-first:** command palette (Ctrl+K), slash commands, templates, daily notes, and quick capture (**done**, November 2026: command palette, slash commands, templates, daily notes, and in-app quick capture; a global desktop shortcut needs the desktop app).

### D. Search that feels instant, without AI

- **Run search in a Web Worker**, using FTS5 or MiniSearch, so it never blocks typing.
- **Quality:** BM25 relevance ranking, prefix and fuzzy matching, word stemming per language, and exact-phrase search.
- **Operators:** `tag:`, `in:notebook`, `is:pinned`, `has:attachment`, `before:2026-01-01`. Saved searches become "smart folders" (**done**, November 2026: `tag:`, `notebook:`/`shelf:`/`library:`, `is:`, `has:attachment`/`task`/`link`, `before:`/`after:` with dates and relative dates, and named saved searches in the sidebar and palette).
- **Search inside attachments:** PDF text extraction with pdf.js; optional OCR for images with Tesseract (classic OCR, not AI).
- **Graph:** a whole-library view rendered with WebGL (for example sigma.js), with filters and a local "neighbourhood" mode (**done**, November 2026: sigma.js with a ForceAtlas2 layout in a worker, filtered by the search box, beside the existing neighbourhood explorer).

### E. Speed targets, enforced in CI (**done**, November 2026: typing, search, and start-up benchmarks, size budgets, and Lighthouse in CI)

| Measure | Target |
|---|---|
| Cold start | under 1 s |
| Open a note | under 50 ms |
| Search 100,000 notes | under 50 ms |
| Typing in a 1 MB note | under 16 ms of main-thread work per keystroke, p95 (smooth at 60 fps; see [PERFORMANCE.md](PERFORMANCE.md) for how it is measured) |

How to reach and keep them:

- Move indexing and storage work to workers.
- Render only the visible part of long lists (TanStack Virtual).
- Split code so editor extras and the graph load only when used.
- Fail the CI build when the bundle exceeds a size budget.
- Benchmark against a generated 100,000-note library.

### F. Reliability: be known for never losing a note

- **Automatic, versioned backups** to a user-chosen folder (File System Access API), with retention rules and reminders.
- **Prove backups work:** test-restore every backup into a temporary database and verify it (the lesson of audit finding 1).
- **Integrity checks at startup:** find and repair broken references, and keep checksums for attachments.
- **Migration tests** against saved sample databases from every past schema version.
- **Controlled updates:** switch the service worker from `registerType: 'autoUpdate'` to an "Update available" prompt, so a deploy never reloads the app in the middle of a session.
- **Optional, private error reporting:** for example self-hosted GlitchTip, never sending note content.

### G. Reach every platform

- **Desktop:** Tauri - small apps that work directly with a folder of Markdown files.
- **Mobile:** an installable app polished for phones, with a Web Share Target so other apps can send content in. Add Capacitor only when native APIs are needed.
- **Capture from anywhere:** a browser-extension web clipper (Mozilla Readability, not AI), a global quick-capture shortcut on desktop, and saving by email or the share sheet.

### H. Extensibility - the moat

A plugin API is what made VS Code and Obsidian category leaders.

- **Isolation:** plugins run sandboxed (worker or iframe) with explicit permissions.
- **Extension points:** commands, views, Markdown syntax, importers, and exporters.
- **Themes:** built on the existing CSS variables.
- **Ecosystem:** a published API and a plugin directory.

### I. Collaboration and publishing (later)

- Shared notebooks with their own encryption keys.
- Real-time co-editing using the CRDT from section A.
- Comments.
- **Publish a notebook as a static website** - cheap to build and a strong discovery channel.

### J. Accessibility and languages (**done**, November 2026: WCAG 2.2 AA checks in CI; English, Spanish, and Arabic with right-to-left layout)

- WCAG 2.2 AA, with axe checks in CI and a screen-reader test matrix.
- Translations (Lingui or FormatJS), right-to-left layouts, and language-aware search.

## 4. Engineering foundations (start here)

- **CI with GitHub Actions:** type check, ESLint, and unit tests (**done**: `.github/workflows/ci.yml`); Playwright on Chromium, Firefox, and WebKit (**done**: `e2e/`); still to add: bundle-size limits and Lighthouse. A production `npm audit` already runs in CI.
- **Testing:** property-based tests (fast-check) for merging, import, and migrations, plus visual regression tests.
- **Repository layout:** `packages/core`, `packages/storage`, `packages/sync`, `apps/web`, and `apps/desktop`.
- **Process:** decision records in `docs/adr/`, Renovate for dependency updates, semantic versioning with a changelog, and feature flags.

## 5. Phased plan

| Phase | When | Deliverables |
|---|---|---|
| **0. Foundations** | Month 1 | CI, ESLint, Playwright, state stores, and a benchmark library (**done**; baseline in [PERFORMANCE.md](PERFORMANCE.md)); still to do: decision records |
| **1. Craft** | Months 1-3 | CodeMirror 6 editor (**done**: CodeMirror replaces the text area, with a live-preview mode as the default and a Source mode), `[[wikilinks]]` derived from text (**done**: autocomplete, preview links, backlinks, and graph; manual link records kept alongside; renames offer to update links; links to headings; embedded notes and sections), command palette (**done**: notes, places, and actions, also from inside the editor), search worker with operators (**done**: operators for words, phrases, exclusions, and tag/notebook/shelf/library/is filters; large libraries search in a worker) |
| **2. Durability** | Months 3-6 | SQLite on OPFS behind the storage interface, attachments as files, automatic verified folder backups, Markdown vault export and importers |
| **3. Everywhere** | Months 6-12 | CRDT data model, encrypted sync to the user's own storage, Tauri desktop app, mobile polish, web clipper |
| **4. Ecosystem** | Month 12+ | Plugin API, publishing, encrypted shared notebooks and collaboration |

## 6. Decisions to make first

These are hard to reverse; each needs an ADR before implementation. **Decided on November 5, 2026: see [DECISIONS.md](DECISIONS.md)** (no CRDT or sync service, stay on IndexedDB, CodeMirror 6, free and open source with no service to run).

1. **CRDT:** Yjs (mature and fast) or Automerge (cleaner history model).
2. **Storage:** SQLite on OPFS, or stay on IndexedDB with a separate search index.
3. **Editor:** CodeMirror 6 (recommended) or ProseMirror.
4. **Sync model:** the user's own storage only, or also a hosted relay.
5. **Business model:** decides whether sync hosting is needed at all.

## 7. How to know it's working (without spying on users)

- **Zero** data-loss reports.
- The speed targets above, published openly.
- Over 99.9% of sessions free of crashes.
- Import success rate, and time until a new user writes their first note.
- Accessibility score and retention, collected only with users' consent.

## 8. What not to do

- Don't chase feature count; polish beats breadth.
- Don't make a server necessary for core use.
- Don't write your own cryptography.
- Don't rewrite everything at once; migrate behind the storage interface.
- Don't lock data into a private format.

## 9. Guidance for contributors and AI assistants

- Treat the four promises in section 2 as acceptance criteria: a change that risks data loss, slows core interactions, weakens privacy, or ties data to a private format needs an explicit, documented reason.
- Keep the app fully usable offline and without an account.
- Route new storage access through `src/lib/` rather than calling IndexedDB from components, so the storage migration in section A stays possible.
- Record significant architectural choices as ADRs in `docs/adr/`, and update this document when the direction changes.
