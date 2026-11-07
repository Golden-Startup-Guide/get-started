# The Personal Knowledge Library - Product Roadmap

This document is the single source of truth for the planned evolution of The Personal Knowledge Library (called My Notes until 1.2.0). It records the product direction, current capabilities, planned feature requirements, and a recommended implementation sequence. A status of **Planned** or **Future** describes intent, not a delivery commitment or release date.

## Vision

The Personal Knowledge Library is an offline-first Progressive Web App: a library of practical, illustrated handbooks to read, alongside the reader's own notes, organised, connected, discovered, and preserved on their device.

It began as a note-taking app (My Notes, 1.0 and 1.1). Version 1.2.0 made it a reading-first library.

Core principles:

- Offline First
- Fast and Lightweight
- Privacy Focused
- User-Owned Data
- Installable PWA
- No Mandatory Cloud Dependencies
- Scalable Architecture

**Status (1.2.0, November 2026):** the reading-first redesign is built, in ten phases recorded in [KNOWLEDGE_LIBRARY_PLAN.md](KNOWLEDGE_LIBRARY_PLAN.md), and checked against the design specification in [ACCEPTANCE.md](ACCEPTANCE.md). **Next:** reviews of the handbooks by qualified people, the screen-reader and usability checks in ACCEPTANCE.md, and later, downloadable content packs and handbooks in more languages.

## Roadmap conventions

- **Completed** means the capability exists in the current application.
- **Planned** means it is a candidate for implementation; it is not yet available.
- **Future** means it depends on product, privacy, or architectural decisions and is not an immediate commitment.
- The recommended implementation order later in this document is dependency- and risk-aware. It intentionally differs from the phase grouping where earlier delivery would provide more value or reduce data-loss risk.
- Every implementation should preserve offline operation, local ownership of note data, and existing user data. Storage migrations must be versioned and tested against existing databases.
- Cloud services remain optional, and AI is not planned ([decision 10](DECISIONS.md#10-no-ai-chat-social-or-dashboard-features)). No roadmap item may make an account or network connection mandatory for core note-taking.

# Current Version (Completed)

## Version 1 (completed baseline)

Features already implemented:

- Create notes
- Edit notes
- Delete notes
- Search notes
- IndexedDB storage
- Offline functionality
- Service worker caching
- Installable PWA
- Responsive UI
- Persistent data within browser profile

Status:

**Completed**

## Version 2 - Personal Notes Workspace

Phase 2 now includes:

- Tags with suggestions, filters, and tag-aware search
- Notebooks, safe note reassignment on deletion, pinning, and favorites
- Debounced autosave, save status, Markdown preview, and note history
- Persisted light, dark, and system themes
- Validated JSON backup and non-destructive merge restore
- Settings with local storage counts, estimate, and About information
- Expanded search, responsive navigation, and keyboard/screen-reader support

Status:

**Completed**

## Version 3 - Data Protection

- Trash Bin with soft delete, restore, and permanent deletion
- Backups include trashed notes; permanent deletion also removes associated history
- IndexedDB schema version 3 adds the optional deletion timestamp without rewriting V2 note records

Status:

**Completed**

## Version 4 - Rich Content

- Interactive Markdown task-list checkboxes
- Accessible checklist completion progress
- Checklist updates are written to Markdown source and follow normal autosave/history behavior

Status:

**Completed**

## Version 5 - Attachments

- Attach files and images to notes with inline image previews and file downloads
- Record and play back audio where browser microphone and media support is available
- Store attachments locally in IndexedDB and preserve them in validated JSON backups
- Enforce per-file, per-note, and backup limits; surface storage quota errors

Status:

**Completed**

### Current implementation baseline

- The application is a React and TypeScript single-page app built with Vite and Tailwind CSS.
- `src/types.ts` defines note, library, shelf, notebook, tag, settings, history, and attachment records.
- `src/lib/notes.ts` uses the `idb` library and the `my-notes` IndexedDB database at schema version 6. Its upgrades migrate V1 notes in place, retaining IDs/content/timestamps and assigning them to `Personal`; v3 adds the optional `deletedAt` lifecycle field, v4 adds a separate attachment store, v5 adds ID-based note relationships, and v6 adds libraries and shelves and assigns existing notebooks to the default shelf without rewriting notes.
- `src/App.tsx` provides library, shelf, notebook, and tag navigation, a Library home page, title/content/tag/notebook search, a debounced Markdown editor, attachments, history, theme and backup settings. All Notes remains a direct view and all data remains browser-local.
- The database has `notes`, `notebooks`, `libraries`, `shelves`, `settings`, `tags`, `history`, `attachments`, and `noteLinks` stores. New installations include the starter notebooks Personal, Work, Ideas, Research, and Health Handbook under Personal Library → General; All Notes is a virtual view.
- Version 4 JSON backups include active and trashed notes, libraries, shelves, notebooks, history, attachments, and linked-note relationships; version 1, 2, and 3 backups remain importable. Restore validates the full backup before writing, merges without replacing existing notes, skips conflicting note IDs and their attachments, restores links whenever both endpoint IDs exist after the merge (including locally existing notes), skips missing endpoints and existing relationships, remaps conflicting hierarchy, notebook, and attachment IDs, and applies accepted records atomically. Import files are limited to 40 MiB.
- Deleting a note moves it to Trash, where it can be restored. Permanent deletion is only available from Trash and removes the note's history; notebook and tag data are preserved appropriately.
- History records the previously saved note for each successful debounced title/content change; identical content and organization-only changes do not create revisions. History is not silently pruned.
- Automated tests use Vitest, React Testing Library, and fake IndexedDB to cover the V1 migration, storage features, backup validation/round trips, autosave, search, favorites, and theme persistence.
- `vite-plugin-pwa` generates a service worker, web manifest, and precached app shell. Notes and attachment data remain in browser-local IndexedDB and do not sync; users can create JSON backups in Settings.
- Vitest and React Testing Library cover storage migration and core user flows. Add focused tests for future storage formats and migrations before relying on them for more complex features.

This baseline is descriptive, not a restriction on future architecture. Keep storage behind well-defined operations and avoid a large rewrite without a concrete need.

# Phase 2 - Data Management

## Feature: Export Notes

Purpose:

Allow users to back up all notes.

Requirements:

- Export all notes as JSON
- Download backup file
- Preserve metadata
- One-click export

Status:

**Completed**

### Future Enhancement

- ZIP exports
- Selective exports
- Scheduled backups

## Feature: Import Notes

Purpose:

Restore backups and transfer notes between devices.

Requirements:

- Import JSON backup
- Validate format
- Merge or replace existing notes

Status:

**Completed**

## Phase 3 - Organisation

### Feature: Tags

Examples:

- Health
- Work
- Research
- Personal
- Ideas

Requirements:

- Add multiple tags per note
- Filter by tag
- Search by tags
- Tag management interface

Status:

**Completed**

### Feature: Notebooks

Examples:

- Personal
- Projects
- Learning
- Journal

Requirements:

- Create notebooks
- Rename notebooks
- Delete notebooks
- Move notes between notebooks
- Notebook sidebar navigation

Status:

**Completed**

### Feature: Pin Notes

Requirements:

- Pin important notes
- Pinned section
- Sorting priority

Status:

**Completed**

### Feature: Favourites

Requirements:

- Star notes
- Quick access view
- Filter favourites

Status:

**Completed**

# Phase 4 - Enhanced Editing

## Feature: Markdown Support

Requirements:

- Markdown editor
- Live preview
- Headings
- Lists
- Code blocks
- Tables
- Links

Status:

**Completed**

## Feature: Auto Save

Requirements:

- Automatic saving
- Save status indicator
- Draft recovery

Status:

**Completed**

## Feature: Dark Mode

Requirements:

- Theme toggle
- System theme detection
- Persist user preference

Status:

**Completed**

# Phase 5 - Data Protection

## Feature: Note History

Purpose:

Protect users from accidental edits.

Requirements:

- Store note revisions
- Revision timestamps
- Compare versions
- Restore previous versions

Status:

**Completed**

## Feature: Trash Bin

Requirements:

- Soft delete
- Restore notes
- Permanent delete

Status:

**Completed**

# Phase 6 - Rich Content

## Feature: Checklists

Requirements:

- Interactive tasks
- Progress tracking
- Checkbox support

Status:

**Completed**

## Feature: Image Attachments

Requirements:

- Upload images
- Store in IndexedDB
- Preview images
- Responsive gallery

Status:

**Completed** — file, image, and audio attachments share the IndexedDB attachment store and backup/import flow.

## Feature: Audio Notes

Requirements:

- Record audio
- Attach recordings
- Playback support

Status:

**Completed** — file, image, and audio attachments share the IndexedDB attachment store and backup/import flow.

## Feature: File Attachments

Requirements:

- Upload files
- Download files
- Associate files with notes

Status:

**Completed** — file, image, and audio attachments share the IndexedDB attachment store and backup/import flow.

# Phase 7 - Knowledge System

## Feature: Linked Notes

Example:

```text
Stress Management
├── Sleep
├── Nutrition
└── Exercise
```

Requirements:

- Create and remove directional links between saved notes from the note editor.
- Follow links and open the exact note by its stable ID; backlinks list notes that point to the current note.
- Disambiguate duplicate titles using notebook names and a short note-ID suffix.
- Keep relationships while either note is in Trash, show trashed counterparts as unavailable, and remove all relationships when a note is permanently deleted.
- Include relationships in local JSON backups and restore links when both endpoint IDs exist after the non-destructive merge; skip dangling endpoints and existing relationships.

Status:

**Completed** — relationships are stored independently from note content in IndexedDB. Links and backlinks work offline; no network service or graph dependency is used. Trash and restore preserve relationships, while permanent deletion removes both incoming and outgoing links. Backup format version 3 preserves links and remains backward-compatible with version 1 and 2 backups.

## Feature: Note map (formerly Knowledge Graph)

Requirements:

- Visual graph
- Relationship explorer
- Connected note discovery

Status:

**Completed** — the note map opens **Around a note**: a bounded, keyboard-operable SVG neighbourhood from stored note links, with directional arrows, zoom, **Skip to the list**, and the same notes listed below it. **Whole library** draws every note with sigma.js (WebGL), loaded only when opened. Handbook pages also list what they are **Mentioned in** and their **Related notes**, each with a plain reason.

# Phase 8 - Personal Knowledge Library

Target Architecture:

```text
Library
└── Shelf
    └── Notebook
        └── Note
```

Example:

```text
Health & Wellbeing
├── Stress
├── Sleep
└── Nutrition

Agriculture
├── Soil
├── Crops
└── Livestock
```

Requirements:

- Shelves
- Notebooks
- Notes
- Library navigation
- Library home page

Status:

**Completed** — the offline-first hierarchy is Library → Shelf → Notebook → Note. The Library home lists its shelves; navigation supports every level and preserves a direct All Notes view. Libraries and shelves can be created, renamed, and deleted only with an explicit destination for their contents. Schema version 6 assigns existing notebooks to Personal Library → General without changing note IDs or content. Version 4 backups preserve the hierarchy and remain compatible with versions 1–3.

# Phase 9 - The Personal Knowledge Library (1.2.0)

Requirements: the design specification ([design/peoples-home-spec.md](design/peoples-home-spec.md)), planned in [KNOWLEDGE_LIBRARY_PLAN.md](KNOWLEDGE_LIBRARY_PLAN.md).

- Built-in, read-only handbooks: eight libraries and 49 pages, each with a picture and its sources, offline from the first launch
- Home, with Continue reading, Explore libraries, and Recently added
- Addresses for every page and note, a breadcrumb, and a rail when the sidebar is collapsed
- Library, shelf, and notebook pages made for reading
- The reading room, with reading settings and the reader's place remembered
- One Search across the handbooks and personal notes
- Mentioned in, Related notes, and the note map around a note
- WCAG 2.2 AA, checked automatically and recorded in [ACCEPTANCE.md](ACCEPTANCE.md)

Status:

**Completed** in 1.2.0. The handbooks stay marked as drafts until qualified reviewers have checked them.

# Not planned: AI features

AI summaries and AI search were once listed here as future work. They are ruled out by [decision 10](DECISIONS.md#10-no-ai-chat-social-or-dashboard-features), together with chat, social, and dashboard features. A proposal for any of them needs a new decision first.

# Technical Roadmap

## Current Stack

- React, TypeScript, and Vite
- Tailwind CSS, with design tokens in `src/workspace.css`
- Zustand for state
- IndexedDB (`idb`)
- CodeMirror 6 for writing
- unified, remark, and KaTeX and Mermaid (loaded on demand) for notes
- sigma.js and graphology for the whole-library note map (loaded on demand)
- A Workbox service worker (`vite-plugin-pwa`) that precaches the app and the handbooks

## Future Technologies

### Search

- Search is a local scan in a worker, within the targets in [PERFORMANCE.md](PERFORMANCE.md) at 20,000 notes. MiniSearch or FlexSearch are candidates only if those targets are missed.

### Content

- Downloadable content packs, once the handbooks outgrow their 600 KiB budget.
- Handbooks in more languages; the content files allow translations.

These are candidates rather than requirements. Evaluate bundle size, offline behavior, accessibility, security, and maintenance cost against the feature before adopting a library or service.

# Recommended Implementation Order

This historical order was based on the V1 code: a single `Note` record with string content, a version-1 IndexedDB store, explicit form-based saving, client-side search, and no automated tests. The Phase 2 items delivered in Version 2 are marked Completed above; the remaining entries are candidate future work.

| Order | Work | User value | Complexity / risk | Dependencies and rationale |
|---|---|---|---|---|
| 1 | Add storage and UI tests for existing note CRUD, ordering, and search | High | Low to medium | Establish a regression baseline before changing the version-1 IndexedDB schema. Tests are an enabling task, not a user-facing feature. |
| 2 | Export Notes | High | Low | The current note schema is simple to serialize. Preserving `id`, `title`, `content`, `createdAt`, and `updatedAt` gives users a portable backup before import or migrations exist. |
| 3 | Auto Save and draft recovery | High | Medium | The current editor only persists on explicit Save; closing it discards changes. Add debounced persistence, visible save/error status, and a recoverable draft before richer editing features increase the cost of lost work. Coordinate autosave with explicit cancel/close behavior. |
| 4 | Import Notes | High | Medium to high | Depends on a documented export format. Validate the entire file before writes; provide an explicit merge/replace choice, preview counts, collision policy, and confirmation. For replace, offer or require an export first. Never silently overwrite or partially import invalid data. |
| 5 | Dark Mode | Medium | Low | Mostly a presentation and persisted-preference change. It has no note-schema dependency and is a safe, independent improvement after the backup foundation. |
| 6 | Tags | High | Medium | Add an optional tags field through a versioned IndexedDB migration with defaults for existing notes. Then add tag editing, filtering, and tag-aware search. This is a useful first organizational feature without changing note ownership or hierarchy. |
| 7 | Pin Notes and Favourites | Medium | Low to medium | Both can be optional note metadata and list filters. Decide whether “pinned” and “favourite” serve distinct user needs; keep sorting deterministic and avoid duplicating navigation concepts unnecessarily. |
| 8 | Notebooks | High | Medium to high | Requires a notebook store, a migration assigning existing notes to a default notebook, defined delete behavior, and move operations. Implement before shelves so notebooks can be the stable organizational unit beneath them. |
| 9 | Trash Bin | High | Medium | **Completed in Version 3.** Soft delete, restore, permanent deletion with history cleanup, and backup coverage for trashed notes. |
| 10 | Markdown Support | Medium | Medium | Decide whether Markdown source replaces plain text or is a compatible rendering layer. Add safe rendering (including safe handling of raw HTML and links), editor/preview controls, and migration behavior without changing existing plain-text notes unexpectedly. |
| 11 | Checklists | Medium | Medium | **Completed in Version 4.** Uses GFM Markdown task items, accessible interactive checkboxes, and completion progress; changes remain portable Markdown. |
| 12 | File, image, and audio attachments | High | High | **Completed in Version 5.** Shared IndexedDB storage, size limits, quota errors, backup/import, deletion cleanup, offline previews, and audio recording/playback. |
| 13 | Note History | Medium to high | High | Requires revision retention limits, timestamps, comparison UI, and restore semantics. Build after autosave and the richer content model so revision boundaries are reliable and storage growth is controlled. |
| 14 | Linked Notes and Backlinks | High | Medium to high | **Completed.** Stable note-ID relationships, editor link management, backlinks, Trash integrity, and version 3 backup/restore support. The relationship model is independent from graph rendering. |
| 15 | Note map (formerly Knowledge Graph) | Medium | High | **Completed.** Around a note (accessible SVG with lists) first, and the whole library (sigma.js) loaded on demand. |
| 16 | Personal Knowledge Library / Shelves | High long-term | High | **Completed.** Library → Shelf → Notebook → Note navigation, Library home, safe schema migration and backup compatibility, and a direct All Notes view. |
| 17 | AI Summaries and AI Search | — | — | **Not planned** ([decision 10](DECISIONS.md#10-no-ai-chat-social-or-dashboard-features)). |

### Delivery guardrails

- Keep each step independently releasable where possible; do not bundle the whole roadmap into one release.
- For any IndexedDB schema change, increment the database version, write an idempotent migration, and verify that an existing V1 database remains readable and editable.
- Treat imports, replacements, migrations, and permanent deletion as data-sensitive operations: validate first, explain the impact, and provide recovery where feasible.
- Measure search performance before adding MiniSearch or FlexSearch; the current in-memory scan is simple and may remain adequate for small personal libraries.
- Keep optional rich-content dependencies out of the initial bundle when practical, and preserve a usable offline path.
- Add keyboard and screen-reader support for new dialogs, navigation, previews, and graph interactions.

# Success Criteria

The application should evolve from:

**Simple Notes App**

to:

**Personal Knowledge Manager**

and ultimately become:

**Personal Knowledge Library**

where users can organise, connect, preserve, and discover information in a structured and meaningful way. With 1.2.0 it is one: a library to read, with the reader's own notes beside it.
