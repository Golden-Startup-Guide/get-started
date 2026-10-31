# My Notes

**A private, offline-first home for notes and personal knowledge.**

My Notes is an installable web app for capturing ideas, organizing them into a
personal library, and connecting related notes. It runs in the browser and
stores your content on your device. There is no account, cloud sync, or
AI-powered processing.

![Illustration of the My Notes workspace with library navigation, searchable notes, and a Markdown editor](docs/images/my-notes-workspace.svg)

*Illustrative view of the workspace and its main areas.*

## What you can do

- **Write comfortably:** create and edit Markdown notes with a live preview,
  interactive checklists, autosave status, and restorable revision history.
- **Keep things organized:** use libraries, shelves, notebooks, tags, favorites,
  and pins to arrange and revisit notes.
- **Find and connect ideas:** search note titles, content, tags, and notebook
  names; link notes, explore backlinks, and navigate a bounded relationship
  graph.
- **Keep useful context nearby:** attach files, preview common images, play
  supported audio, and record audio when the browser permits it.
- **Recover and move your data:** restore deleted notes from Trash and export or
  import validated JSON backups.
- **Work across conditions:** use the responsive, installable PWA online or
  offline after its app shell has been cached.

## Get started

Requirements: Node.js and npm for local development; a modern browser with
IndexedDB for using the app.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To create and serve a production build:

```bash
npm run build
npm run preview
```

The production build includes a web app manifest and a service worker that
precaches the app shell. Install My Notes from the browser's install control on
supported devices. Production service workers require HTTPS; localhost is
supported for development.

### Navigate the library

The workspace has a collapsible sidebar on desktop and a menu-controlled
navigation drawer on narrower screens. Open it to reach All Notes, Favorites,
Trash, Knowledge Graph, libraries, shelves, notebooks, tags, and Settings.
Use the disclosure controls to expand or collapse library and shelf contents.
The main view includes breadcrumbs when you are inside a library, shelf, or
notebook.

## Your data and privacy

Notes, relationships, attachments, settings, and history are stored in the
browser's IndexedDB database on the current device and browser profile. My Notes
does not provide an account or automatically synchronize data between devices.
Data is also scoped to the app's origin: changing hostname, port, or browser
profile can make a different local database appear. Clearing browser site data
can remove locally stored content. If notes appear missing, do not clear site
data; first check that you opened the same app URL and browser profile. Export
a backup from **Settings** and keep a copy somewhere separate from the browser
profile.

Backups include note content and metadata, Trash, attachments, note links,
libraries, shelves, notebooks, and history. Import validates the file and
merges it without replacing existing notes. See the [complete app guide](docs/APP_GUIDE.md)
for storage, backup, migration, and feature details.

## Project documentation

- [Complete app guide](docs/APP_GUIDE.md) — features, usage, data handling,
  architecture, and development.
- [Library catalog](docs/LIBRARY_CATALOG.md) — proposed subject libraries and
  their shelves and notebooks.
- [UI design direction](docs/UI_DESIGN.md) — library-first information
  architecture, responsive navigation, and accessibility requirements.
- [Product roadmap](docs/ROADMAP.md) — current status and future direction.

## Development

```bash
npm test       # Vitest and React Testing Library
npm run build  # TypeScript project checks and production PWA build
```

The app is built with React, TypeScript, Vite, Tailwind CSS, IndexedDB (`idb`),
and `vite-plugin-pwa`. Tests use Vitest, React Testing Library, and
`fake-indexeddb`.
