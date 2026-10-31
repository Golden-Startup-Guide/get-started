# My Notes - Complete App Guide

This guide describes the current implementation of My Notes: how to use it,
where it stores data, how to preserve that data, and how the application is
organized for development. It covers shipped functionality, not every idea in
the product roadmap.

## 1. Product overview

My Notes is a responsive, offline-first Progressive Web App (PWA) for taking
notes and building a personal knowledge library. It is designed around local
ownership of data, quick capture, flexible organization, and safe recovery.

### Product principles

- **Local by default:** the app uses browser storage; core note-taking does not
  depend on an account, application server, or cloud provider.
- **Offline capable:** the installable app shell is cached for later use.
- **User-controlled:** export and import provide a portable backup path.
- **Progressive:** media recording and playback depend on browser support and
  permissions rather than a separate media service.
- **Accessible and responsive:** navigation, editors, dialogs, and graph views
  are designed for keyboard use, assistive technology, and different screen
  sizes.

AI summaries and semantic search are not part of the current application.
Search remains local text matching; note content is not sent to an AI service.

## 2. Feature guide

### 2.1 Notes and the workspace

Create a note from the workspace's **New note** action. Edit its title and
Markdown content in the note editor. Notes are saved locally with creation and
update timestamps. The workspace provides the global **All Notes** view as
well as narrower views for favorites, Trash, notebooks, tags, libraries, and
shelves.

Pinned notes are prioritized at the top of the note list. Favorites have a
dedicated view. Notes can be moved between notebooks, and notebooks can be
organized into shelves and libraries.

#### Navigation on desktop, tablet, and phone

The application header includes a sidebar toggle. On wide screens, the sidebar
is visible by default and can be collapsed or restored with that toggle. At
the compact breakpoint (1023 pixels and below), the same control opens a
navigation drawer instead. The drawer has a close button, closes on Escape or
when a destination is selected, and returns focus to its opener when dismissed.
Its contents scroll independently of the page.

The sidebar groups All Notes, Favorites, Trash, and Knowledge Graph above the
library hierarchy. Use the disclosure buttons to expand or collapse libraries
and shelves. Tags and Settings are available below the hierarchy. When viewing
a library, shelf, or notebook, the header shows breadcrumbs for its location.
On compact screens, open the drawer with the menu button to reach these
destinations.

### 2.2 Libraries, shelves, notebooks, and tags

The organization hierarchy is:

```text
Library
└── Shelf
    └── Notebook
        └── Notes
```

New installations start with **Personal Library**, a **General** shelf, and the
starter notebooks **Personal**, **Work**, **Ideas**, **Research**, and
**Health Handbook**. **All Notes** remains a virtual, flat view across the
workspace.

Create, rename, and navigate libraries, shelves, and notebooks from the
workspace. Notes belong to notebooks; notebooks belong to shelves; shelves
belong to libraries. When deleting a shelf or library, choose a destination
for its contents so notes and notebooks are not orphaned. Deleting a notebook
also requires reassignment of its notes.

Tags are attached to notes as labels. Existing tags are suggested while
editing, and a tag can be selected to filter the note list. Tag counts reflect
active notes rather than notes in Trash.

### 2.3 Search

Use the workspace search field to find notes by title, note content, tags,
notebook, shelf, or library name. Matching results are counted and matching
text is highlighted where applicable. Search runs locally against the browser's
stored data.

There is no remote index, model download, or semantic-search service.

### 2.4 Markdown, checklists, and autosave

The editor provides Markdown source editing alongside a live preview. Supported
content includes headings, paragraphs, emphasis, links, lists, task lists,
blockquotes, code, and GitHub-Flavored Markdown features.

Task-list checkboxes in the preview are interactive. Toggling a checkbox
updates the Markdown source, saves the changed note, and updates checklist
completion progress.

Edits are saved with a debounce rather than writing on every keystroke. The
editor indicates whether changes are unsaved, saving, or saved. The save path
serializes in-flight writes to prevent an older autosave from overwriting a
newer note state or a deletion.

Pending edits are also saved immediately when the page is hidden (switching
tabs or apps, or closing the tab). While a change is unsaved or still being
written, the browser asks for confirmation before the page closes or reloads.

Markdown is rendered with `react-markdown` and `remark-gfm`; raw HTML rendering
is not enabled. Links and other rendered content are not a general-purpose
HTML execution surface. External links in the preview open in a new tab, so following
one never navigates the app away from an open note.

### 2.5 History and restore

The app stores timestamped snapshots when a successful save changes a note's
title or Markdown content. Identical title/content saves and organization-only
changes do not create a revision. Open a note's history to inspect saved
revisions and restore an earlier snapshot.

Because autosave runs after every pause in typing, saves are grouped into
editing bursts: a new revision is created only when at least five minutes have
passed since the note's latest revision, and that revision holds the text from
before the burst. Restoring a revision always records the current text first,
so a restore can be undone. Each note keeps its 50 most recent revisions; older
ones are removed when a new revision is added.

History is kept in local IndexedDB and is included in backups unless excluded
at export. Permanently deleting a note from Trash also removes its history.

### 2.6 Linked notes and knowledge graph

Notes can be explicitly linked by their stable IDs. The relationship explorer
shows a bounded SVG neighborhood around the selected note, with incoming and
outgoing relationships and a list of connected notes. Select a listed note to
open it directly.

The visual graph limits the number of displayed direct neighbors to keep the
view legible and responsive; the relationship lists retain the complete set of
connections. Trashed notes are excluded from normal relationship discovery.
Links are stored separately from note text and are included in backups.

### 2.7 Attachments and audio

Attach files to a saved note. Common raster images are previewed inline,
browser-supported audio can be played in the editor, and other file types are
offered as downloads rather than being embedded as active content.

The current limits are:

| Limit | Maximum |
|---|---:|
| One attachment | 5 MiB |
| Attachments on one note | 20 files |
| Total attachment data on one note | 20 MiB |
| Imported or exported backup file | 40 MiB |

Audio recording requires browser microphone support, permission, and a secure
context (HTTPS or localhost). Playback depends on the browser's supported audio
formats. Browser storage quotas can impose additional limits beyond the app's
per-file and per-note limits.

### 2.8 Trash

Deleting a note moves it to **Trash** instead of immediately removing it.
Restore a note to return it to the active workspace, or permanently delete it
from Trash. Permanent deletion removes that note's attachments and history.
Trash contents are included in exported backups and can be restored by
importing a backup.

### 2.9 Themes and Settings

Choose **Light**, **Dark**, or **System** in Settings. The preference is stored
locally; System follows the browser or operating system color-scheme
preference.

Settings also provides backup import and export, storage estimates and
category counts, and About information. Storage estimates are informational
and depend on browser reporting.

## 3. Backups and data portability

### Export

Use **Settings → Export JSON backup** to download a portable JSON file. The
backup contains the supported application data, including active and trashed
notes, libraries, shelves, notebooks, tags, theme settings, note history,
attachments, and note links.

Backups are limited to 40 MiB, and attachments take about a third more space in
a backup than on the device. To keep a backup under the limit, clear **Include
attachments** and/or **Include history** before exporting; Settings shows how
much of each is stored. A backup without attachments or history imports
normally and restores everything else.

### Import

Use **Settings → Import JSON backup** to select a backup file. The importer
validates the file before writing and applies accepted records atomically.
Import is a **merge**, not a replace operation:

- Existing notes are not overwritten.
- Duplicate note IDs are skipped, along with attachments that belong only to
  those skipped notes.
- Conflicting organization and attachment IDs are remapped so imported
  records do not replace local records.
- Links are restored when both endpoint notes exist after the merge; invalid
  endpoints and already-existing relationships are skipped.
- Notes or history entries that reference a notebook missing from the backup
  are placed in an existing notebook instead of rejecting the whole file.
- Older supported backup formats remain importable.
- Files larger than 40 MiB are rejected.

Keep backups outside the browser profile. A backup stored only in the same
profile does not protect against that profile's data being cleared or lost.

## 4. Local storage, migrations, and offline behavior

### IndexedDB database

The application uses the `my-notes` IndexedDB database through the `idb`
library. The current schema version is **6** and has stores for:

| Store | Purpose |
|---|---|
| `notes` | Note text, timestamps, organization, flags, and deletion state |
| `libraries` | Top-level organization |
| `shelves` | Groups notebooks within libraries |
| `notebooks` | Groups notes within shelves |
| `tags` | Derived active-note labels and counts |
| `settings` | Theme preference |
| `history` | Timestamped note snapshots |
| `attachments` | Attachment metadata and binary data |
| `noteLinks` | Stable-ID relationships between notes |

### Existing-user migrations

Database upgrades run through versioned IndexedDB migrations. The upgrade
path preserves existing note IDs and content:

1. The original V1 notes are retained and assigned to the **Personal**
   notebook when organization is added.
2. Later versions add deletion state, attachment storage, linked-note
   relationships, and the library/shelf hierarchy.
3. The V6 migration creates **Personal Library → General** and assigns
   existing notebooks to that shelf without rewriting note records.

The application should be opened normally to let IndexedDB apply its
registered upgrades. Do not manually delete the database as a troubleshooting
step unless you intentionally want to erase the local data.

### Offline and device boundaries

The PWA build generates a web app manifest and service worker that precaches
the app shell. After the first successful online load and service-worker
installation, the app shell can be opened offline. Notes and attachments are
already local, so their normal read/write operations do not require a network
connection.

Data belongs to the app's origin (scheme, hostname, and port), browser profile,
and device where it was created. Opening the app at a different origin or in a
different profile uses a separate database and can make existing notes appear
missing. It does not automatically synchronize between browsers or devices.

### Persistent storage

By default, browsers treat site data as "best-effort" and may clear it when the
device runs low on space; Safari can also clear data for sites that are not
installed after seven days without use. After the first note is saved in a
session, My Notes asks the browser to make its storage persistent. Settings →
Storage on this device shows whether persistent storage is on and, when it is
off, offers **Keep notes on this device** to ask again. Browsers decide whether
to grant it (installing the app usually helps), so keep exporting backups.
Browser storage may be cleared by the user or browser, and available capacity
varies by platform; regular exports are recommended. If notes appear missing,
verify the original app URL and browser profile before taking any action on
site data. Do not clear browser storage as a troubleshooting step.

## 5. Technology and architecture

My Notes is a TypeScript single-page application built with React and Vite.
Tailwind CSS and project styles provide the responsive interface. Markdown is
rendered with `react-markdown` and `remark-gfm`; icons use `lucide-react`.
IndexedDB access is centralized in `src/lib/notes.ts`. The PWA manifest and
service worker are generated by `vite-plugin-pwa`.

### Key source areas

| Path | Responsibility |
|---|---|
| `src/App.tsx` | Workspace navigation, feature composition, editor, and Settings UI |
| `src/features/notes/` | Autosave, checklist behavior, and attachment limits |
| `src/features/graph/` | Relationship graph model and accessible SVG explorer |
| `src/lib/notes.ts` | IndexedDB schema, migrations, persistence, history, and backup validation |
| `src/types.ts` | Shared application data types |
| `src/workspace.css` | Workspace-specific responsive and theme styling |
| `src/index.css` | Base styles and global presentation |
| `src/App.test.tsx` | Workspace interaction and navigation tests |
| `src/lib/notes.test.ts` | Storage, migration, and backup tests |
| `src/features/` | Focused feature-level tests beside their implementation |
| `docs/ROADMAP.md` | Product direction and feature status |

### Main data relationships

- A note belongs to a notebook; a notebook belongs to a shelf; a shelf belongs
  to a library.
- Notes can have multiple tags, and tags are derived from active notes.
- Pin and favorite flags are stored on the note.
- Trash is represented by a deletion timestamp on the note.
- Note links use source and target note IDs, independently of note content.
- Attachments and history are separate records linked to note IDs.

## 6. Local development and verification

### Requirements

- Node.js and npm
- A modern browser with IndexedDB for running the application

### Commands

```bash
npm ci
npm run dev
npm test
npm run build
npm run preview
```

- `npm run dev` starts the Vite development server.
- `npm test` runs the Vitest suite once.
- `npm run build` runs the TypeScript project build checks and creates the
  production PWA output in `dist/`.
- `npm run preview` serves the production build locally after a build.

The test setup uses Vitest, React Testing Library, `user-event`, and
`fake-indexeddb`. Tests cover database migrations and operations, backup
validation and compatibility, autosave behavior, graph relationships, and
major workspace interactions.

## 7. Current boundaries

- There is no account, cloud sync, hosted backend, or automatic cross-device
  replication.
- Search is local title/content/tag/notebook matching; AI summaries and
  semantic search are deferred.
- Audio capture and playback vary with browser capabilities and permissions.
- Browser quota and data-retention policies remain outside the app's control.
- The graph is a bounded neighborhood explorer rather than an unbounded
  whole-library visualization.

See the [product roadmap](ROADMAP.md) for completed and future product work.
