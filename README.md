# My Notes

A responsive, offline-first notes app built with React, TypeScript, Vite, and Tailwind CSS. Notes are stored in IndexedDB on the current browser and device; there is no account, server, or cloud sync.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

The production build includes a web app manifest, install icons, and a service worker that precaches the app shell. After the first successful load, the app shell is available offline. Install it from the browser's install option on supported desktop and mobile browsers. Service workers require HTTPS in production; localhost is supported for development.

Notes stay in the browser profile where they were created. Clearing that browser's site data removes them, and notes do not automatically sync between devices.

## Phase 2 features

Organize notes with notebooks and tags, mark important notes as pinned or favorite, search titles/content/tags/notebook names, and edit with a safe live Markdown preview. Changes autosave locally; previous content revisions can be restored from note history. Light, dark, and system themes are available in Settings.

Markdown task-list checkboxes are interactive in the live preview, with a saved completion count. Toggling a task updates the Markdown source and autosaves like other note edits.

Attach files, images, and audio recordings to notes. Common raster images preview inline, browser-supported audio plays locally, and other file types download from the editor rather than being rendered. Attachments are stored in IndexedDB and remain available offline; each attachment is limited to 5 MiB and each note to 20 MiB of attachments. Recording requires browser microphone support, a secure context, and permission.

Deleting a note moves it to **Trash**, where it can be restored or permanently deleted. Permanent deletion also removes that note's history. Backups include notes in Trash, so they can be recovered after restoring a backup.

Use **Settings → Export JSON backup** to download a backup, including attachments. Import merges a validated backup without overwriting existing notes; duplicate note IDs are skipped, and conflicting notebook IDs are remapped. Files larger than 40 MiB are rejected. Keep backups somewhere separate from this browser profile for recovery if local site data is cleared.

V1 notes are migrated in place when the app opens. Their IDs and content are preserved and they are assigned to the Personal notebook. Later IndexedDB upgrades retain existing notes, history, settings, and notebooks; version 4 adds attachment storage without rewriting note records.

## Tests

```bash
npm test
```

The test suite covers the IndexedDB migrations, storage operations, backup/restore validation, and key workspace interactions.
