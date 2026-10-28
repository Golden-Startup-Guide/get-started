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

## Version 1

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

### Current implementation baseline

- The application is a React and TypeScript single-page app built with Vite and Tailwind CSS.
- `src/types.ts` defines a note with an ID, title, content, creation timestamp, and update timestamp.
- `src/lib/notes.ts` uses the `idb` library and an IndexedDB database named `my-notes`, currently at schema version 1. Notes are loaded from the `notes` object store and sorted by update time.
- `src/App.tsx` provides the note list, client-side title/content search, and a create/edit dialog. Saving is explicit; closing or cancelling an editor does not save its draft.
- `vite-plugin-pwa` generates a service worker, web manifest, and precached app shell. Note records themselves remain in browser-local IndexedDB; they are not synced or backed up automatically.
- The app currently has no automated test script or test suite. New storage formats and migrations should add focused tests before they become the basis for more complex features.

This baseline is descriptive, not a restriction on future architecture. Refactor storage behind well-defined operations as feature work warrants it; avoid a large rewrite before a concrete need.

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

**Planned**

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

**Planned**

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

**Planned**

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

**Planned**

### Feature: Pin Notes

Requirements:

- Pin important notes
- Pinned section
- Sorting priority

Status:

**Planned**

### Feature: Favourites

Requirements:

- Star notes
- Quick access view
- Filter favourites

Status:

**Planned**

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

**Planned**

## Feature: Auto Save

Requirements:

- Automatic saving
- Save status indicator
- Draft recovery

Status:

**Planned**

## Feature: Dark Mode

Requirements:

- Theme toggle
- System theme detection
- Persist user preference

Status:

**Planned**

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

**Planned**

## Feature: Trash Bin

Requirements:

- Soft delete
- Restore notes
- Permanent delete

Status:

**Planned**

# Phase 6 - Rich Content

## Feature: Checklists

Requirements:

- Interactive tasks
- Progress tracking
- Checkbox support

Status:

**Planned**

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

This order is based on the current V1 code: a single `Note` record with string content, a version-1 IndexedDB store, explicit form-based saving, client-side search, and no automated tests. It prioritizes backup and recovery before introducing richer data structures.

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
| 9 | Trash Bin | High | Medium | Changes deletion semantics and requires migration or a deletion marker, restore behavior, and permanent-delete rules. Implement before attachment cleanup and consider backup/import treatment of trashed notes. |
| 10 | Markdown Support | Medium | Medium | Decide whether Markdown source replaces plain text or is a compatible rendering layer. Add safe rendering (including safe handling of raw HTML and links), editor/preview controls, and migration behavior without changing existing plain-text notes unexpectedly. |
| 11 | Checklists | Medium | Medium | Choose between Markdown task syntax and structured checklist data. This decision should follow the Markdown/content-model decision to avoid incompatible parallel formats. |
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
