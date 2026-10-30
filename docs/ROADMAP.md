# My Notes - Product Roadmap

This document is the single source of truth for the planned evolution of My Notes. It records the product direction, current capabilities, planned feature requirements, and a recommended implementation sequence. A status of **Planned** or **Future** describes intent, not a delivery commitment or release date.

## Vision

My Notes is an offline-first Progressive Web App designed to help users capture, organise, search, and manage personal knowledge.

The long-term vision is to evolve from a simple note-taking application into a Personal Knowledge Library where information can be organised, connected, discovered, and preserved.

Core principles:

- Offline First
- Fast and Lightweight
- Privacy Focused
- User-Owned Data
- Installable PWA
- No Mandatory Cloud Dependencies
- Scalable Architecture

## Roadmap conventions

- **Completed** means the capability exists in the current application.
- **Planned** means it is a candidate for implementation; it is not yet available.
- **Future** means it depends on product, privacy, or architectural decisions and is not an immediate commitment.
- The recommended implementation order later in this document is dependency- and risk-aware. It intentionally differs from the phase grouping where earlier delivery would provide more value or reduce data-loss risk.
- Every implementation should preserve offline operation, local ownership of note data, and existing user data. Storage migrations must be versioned and tested against existing databases.
- Cloud services and AI providers remain optional. No roadmap item may make an account or network connection mandatory for core note-taking.

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

### Current implementation baseline

- The application is a React and TypeScript single-page app built with Vite and Tailwind CSS.
- `src/types.ts` defines note, notebook, tag, settings, and history records.
- `src/lib/notes.ts` uses the `idb` library and the `my-notes` IndexedDB database at schema version 3. Its upgrades migrate V1 notes in place, retaining IDs/content/timestamps and assigning them to `Personal`; v3 adds the optional `deletedAt` lifecycle field without rewriting V2 note data.
- `src/App.tsx` provides notebook/tag navigation, title/content/tag/notebook search, a debounced Markdown editor, history, theme and backup settings. Existing notes remain browser-local.
- The database has `notes`, `notebooks`, `settings`, `tags`, and `history` stores. New installations include the starter notebooks Personal, Work, Ideas, Research, and Health Handbook; All Notes is a virtual view.
- JSON backups include active and trashed notes. Restore validates the full backup before writing, merges without replacing existing notes, skips conflicting note IDs, remaps conflicting notebook IDs, and applies accepted records atomically. Import files are limited to 10 MiB.
- Deleting a note moves it to Trash, where it can be restored. Permanent deletion is only available from Trash and removes the note's history; notebook and tag data are preserved appropriately.
- History records the previously saved note for each successful debounced title/content change; identical content and organization-only changes do not create revisions. History is not silently pruned.
- Automated tests use Vitest, React Testing Library, and fake IndexedDB to cover the V1 migration, storage features, backup validation/round trips, autosave, search, favorites, and theme persistence.
- `vite-plugin-pwa` generates a service worker, web manifest, and precached app shell. Note records remain in browser-local IndexedDB and do not sync; users can create JSON backups in Settings.
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

**Planned**

## Feature: Audio Notes

Requirements:

- Record audio
- Attach recordings
- Playback support

Status:

**Planned**

## Feature: File Attachments

Requirements:

- Upload files
- Download files
- Associate files with notes

Status:

**Planned**

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

- Link notes together
- Backlinks
- Relationship tracking

Status:

**Planned**

## Feature: Knowledge Graph

Requirements:

- Visual graph
- Relationship explorer
- Connected note discovery

Status:

**Planned**

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

**Future**

# Phase 9 - AI Features

## AI Summaries

Requirements:

- Summarise long notes
- Extract key points
- Extract action items

Status:

**Future**

## AI Search

Example:

> What did I write about stress?

Requirements:

- Semantic search
- Natural language queries
- Context-aware answers

Status:

**Future**

AI capabilities must clearly disclose where processing occurs. Local processing is preferred when practical. Any cloud integration must be opt-in, explain what note content is sent and to whom, and leave the rest of the application usable offline without AI.

# Technical Roadmap

## Current Stack

- React
- TypeScript
- Vite
- Tailwind CSS
- IndexedDB
- Service Worker

## Future Technologies

### Search

- MiniSearch
- FlexSearch

### Markdown

- React Markdown

### Graph Visualisation

- React Flow

### AI

- Local AI models
- Cloud AI integration (optional)

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
| 12 | File, image, and audio attachments | High | High | Share a common attachment model and IndexedDB storage strategy where possible. Define file-size/type limits, quota errors, export/import behavior, deletion cleanup, and graceful offline previews before exposing uploads. Add image preview and audio recording/playback as scoped interfaces over that foundation. |
| 13 | Note History | Medium to high | High | Requires revision retention limits, timestamps, comparison UI, and restore semantics. Build after autosave and the richer content model so revision boundaries are reliable and storage growth is controlled. |
| 14 | Linked Notes and Backlinks | High | Medium to high | Depends on stable note IDs and explicit link integrity behavior when a linked note is deleted or moved. Start with textual links/backlinks; keep the relationship model independent from graph rendering. |
| 15 | Knowledge Graph | Medium | High | Depends on linked-note relationships and a useful amount of user data. Begin with a bounded, accessible relationship explorer; assess graph library bundle cost before adoption. |
| 16 | Personal Knowledge Library / Shelves | High long-term | High | A hierarchy redesign affecting navigation, migrations, imports, and notebook ownership. Implement only after notebook semantics have settled; preserve the current flat “All notes” access and migrate existing data safely. |
| 17 | AI Summaries and AI Search | Variable | High / privacy-sensitive | Depends on a mature content model and clear user consent, processing location, cost, and offline behavior. Prototype opt-in integrations independently; do not make AI a prerequisite for search or core note operations. |

### Delivery guardrails

- Keep each step independently releasable where possible; do not bundle the whole roadmap into one release.
- For any IndexedDB schema change, increment the database version, write an idempotent migration, and verify that an existing V1 database remains readable and editable.
- Treat imports, replacements, migrations, and permanent deletion as data-sensitive operations: validate first, explain the impact, and provide recovery where feasible.
- Measure search performance before adding MiniSearch or FlexSearch; the current in-memory scan is simple and may remain adequate for small personal libraries.
- Keep optional rich-content and AI dependencies out of the initial bundle when practical, and preserve a usable offline path.
- Add keyboard and screen-reader support for new dialogs, navigation, previews, and graph interactions.

# Success Criteria

The application should evolve from:

**Simple Notes App**

to:

**Personal Knowledge Manager**

and ultimately become:

**Personal Knowledge Library**

where users can organise, connect, preserve, and discover information in a structured and meaningful way.
