# Decisions

The hard-to-reverse choices behind The Personal Knowledge Library (called My
Notes until 1.2.0). Decisions 1 to 8 were made on November 5, 2026, and 9 and 10
on November 6, with the reading-first redesign. Each
records what was chosen, why, and what would make it worth revisiting. They
answer the five questions in
[ARCHITECTURE_VISION.md §6](ARCHITECTURE_VISION.md#6-decisions-to-make-first),
plus how the app reaches desktop and phone.

## 1. Business model: free and open source, with no service to run

**Decision.** The app is free, open source under the [MIT licence](../LICENSE),
and has no server, accounts, subscriptions, or paid tier.

**Why.** The app's promise is privacy and ownership: notes live on the device,
and nothing is sent anywhere. A paid tier would mostly pay for hosted sync,
which (decision 3) is not part of the app. With nothing to operate, there is
nothing to fund, secure, or shut down, and anyone can keep the app running from
the source.

**Revisit if** hosted sync or collaboration becomes a goal, which would bring
running costs.

## 2. Storage: stay on IndexedDB

**Decision.** Notes stay in IndexedDB (through `idb`), with attachments stored as
binary data in their own store. SQLite in WebAssembly on the private file
system (OPFS) is not adopted. This settles roadmap item 18.

**Why.**
- IndexedDB is fast enough where it matters. With search in a worker,
  per-keystroke work stays within the 16 ms target, and 100,000-note libraries
  load and search acceptably (see [PERFORMANCE.md](PERFORMANCE.md)).
- The data is protected by tested migrations from every released version
  (`src/test/databaseFixtures`), a start-up integrity check, and backups that
  are proven by restoring them. Moving to SQLite would put that at risk for
  little gain.
- SQLite in WebAssembly adds about 1 MB to download, needs cross-origin
  isolation headers that GitHub Pages cannot send (decision 6), and OPFS
  support for synchronous access is still uneven in Safari.
- Full-text search (SQLite's FTS5) is the main thing SQLite would add, and the
  worker search already meets the speed targets.

**Revisit if** libraries well beyond 100,000 notes become common, or relevance
ranking needs a real full-text index; a search index in the worker would come
first.

## 3. Sync: none between devices; the user's own folder for copies

**Decision.** There is no sync service and no CRDT (Yjs or Automerge). Each
device keeps its own library. Notes move between devices through the user's own
storage: automatic backups to a folder (which a cloud drive can sync), JSON
backups, and Markdown exports, all of which import as merges that never
overwrite.

**Why.** Real sync needs either a server (accounts, costs, a security burden;
see decision 1) or two-way merging through a shared folder, which only Chrome
and Edge on computers can do and which risks conflicting edits. Both are large,
and neither is needed to keep notes safe: backups to a folder already protect
against losing a device. Tabs on one device stay in step through
BroadcastChannel, with a choice offered when the same note was changed in two
tabs.

**Revisit if** using several devices every day becomes the main need. Then
build bring-your-own-storage sync of encrypted CRDT updates (Yjs), as
ARCHITECTURE_VISION §B describes, before any hosted relay.

## 4. Editor: CodeMirror 6

**Decision.** Notes are Markdown text edited with CodeMirror 6, with live
preview (formatting shown outside the line being edited) and a Source mode.

**Why.** Markdown text is the format notes are stored and exported in, so
nothing is lost converting to and from a rich-text document model, as
ProseMirror would need. CodeMirror handles very large notes smoothly (typing
stays within 16 ms in a 1 MB note), and its extensions provide live preview,
completions for links and slash commands, and syntax highlighting. This has
been in place since November 2026.

**Revisit if** WYSIWYG tables or real-time collaboration become goals.

## 5. Sync engine

Not needed: with no sync (decision 3), there is no sync engine to choose. If
sync is revisited, the recommendation is Yjs, which is mature, fast, and works
with bring-your-own storage.

## 6. Desktop and phone: the installable web app

**Decision.** The app reaches desktop and phone as a Progressive Web App. It
installs from the browser (Chrome, Edge, Safari on iPhone and iPad through Add
to Home Screen, and Android), works offline, and opens in its own window.
There is no Electron, Tauri, or app-store build. Pages and notes are captured
with a bookmarklet web clipper, and on Android by sharing to the installed app.

**Why.** One code base and one release reach every platform, with no app-store
review or signing, and without the 100 MB-plus download of a bundled browser.
The web platform already provides what the app needs: offline storage, files,
audio recording, and a folder for backups in Chromium.

**Revisit if** a global keyboard shortcut outside the browser, or a desktop
vault that *is* a folder of Markdown files, becomes important. That would be a
Tauri app, which is small.

## 7. Hosting: GitHub Pages

**Decision.** The app is published to GitHub Pages from the `main` branch by a
GitHub Actions workflow, with HTTPS. A custom domain can be added later without
code changes.

**Why.** It is free, uses the existing repository, and every merge to `main`
deploys once CI passes. The app is static files, so nothing else is needed.

**Trade-off.** GitHub Pages cannot send HTTP security headers. The Content
Security Policy is therefore delivered in a `<meta>` tag, which covers scripts,
styles, connections, workers, and objects but not `frame-ancestors` (embedding
by other sites); the app also refuses to run inside a frame. Moving to
Cloudflare Pages or Netlify would allow real headers if that matters later.

## 8. Notebook names are unique across all libraries

**Decision.** No two notebooks may share a name (ignoring capitals), even in
different libraries or on different shelves. Trying to create or rename one to
a name in use says where the existing notebook is.

**Why.** A notebook's name is how much of the app finds it:
- note links shown as "Note — Notebook" use it to tell apart notes with the same
  title;
- imports and backup restores merge notebooks by name;
- the Inbox, Templates, and Daily notes notebooks are found by name;
- search's `notebook:` filter matches names.

Allowing duplicates would make each of these ambiguous, and the confusion it
avoids is small: a clear message when a name is taken.

**Revisit if** people want the same notebook name in different libraries
(for example "Ideas" for work and home). That would need notebooks to be named
by their path (`Library › Shelf › Notebook`) everywhere they are shown,
matched, and imported.

## 9. The handbooks come with the app, read-only

**Decision.** The app ships curated handbooks (libraries, shelves, notebooks,
and pages written in `content/`). They are part of every install, readable
offline from the first launch, versioned with the app, and read-only. People
make a personal copy of a page, or write a note about it, to work with one.
They are not in backups, since every install already has them.

**Why.** In the owner's words: "a Library with Books, not an Empty Note-Taking
App". The first launch should feel like entering a stocked library. Bundling
keeps it offline and private: nothing is fetched, and nobody learns what is
read.

**Revisit if** the handbooks outgrow their size budget (600 KiB,
`scripts/checkSizes.mjs`). Downloadable content packs are the planned next
step then.

## 10. No AI, chat, social, or dashboard features

**Decision.** The app has no AI features (assistants, generated summaries,
semantic search, or chat with notes), no communication (chat, comments, voice,
or video calls), no social features (profiles, likes, follows, or feeds), and
no dashboards (activity feeds, scores, streaks, or charts of reading).

**Why.** The design specification rules these out, and the owner confirmed it
when the redesign began. The app is for reading and keeping knowledge calmly
and privately. Each of these would send content off the device, compete with
reading for attention, or both.

**Revisit if** the owner decides otherwise. A proposal needs a new decision
here first, saying where any processing happens and what leaves the device.
