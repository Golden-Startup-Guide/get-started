# Changelog

All notable changes to The Personal Knowledge Library (called My Notes up to 1.1.0). Versions follow [semantic versioning](https://semver.org/):
a **major** version may need something from you (a new backup format, say), a **minor** version
adds features, and a **patch** fixes problems. The app updates itself, asking first; see
[docs/RELEASING.md](docs/RELEASING.md) for how releases are made.

## [Unreleased]

### Added
- Every page and note has its own address, so **Back** and **Forward** work, a reload keeps your place, and pages can be bookmarked. A missing page or note is explained rather than shown blank.
- A breadcrumb on every page; on phones, a link up a level and a **Page location** button.
- The collapsed sidebar becomes a rail of named icons instead of disappearing, and a **Skip to main content** link comes first.
- A **Soft paper** theme for long reading. Older versions read its backups as the light theme.

### Changed
- The app is now **The Personal Knowledge Library**, the first step of the plan in [docs/KNOWLEDGE_LIBRARY_PLAN.md](docs/KNOWLEDGE_LIBRARY_PLAN.md). Messages say "the app" in place of the old name. Your notes, settings, and backups are unchanged.
- New colours from the design specification: warm paper, forest green, and a blue focus ring, in light and dark. Every pairing is checked against WCAG 2.2 AA.
- Titles and note text use a serif for easier reading.
- The sidebar is 264 px wide; tablets up to 1199 px use the navigation drawer. On phones, the page title and its location sit under the header buttons with the full width.

## [1.1.0] - 2026-11-06

Notes that read like documents, and a plan for what comes next.

### Changed
- Note cards show the start of each note formatted, as headings, bullets, and checkboxes, instead of its raw text with `#`, `**`, and `|` marks. Tables, code, formulas, diagrams, and images appear as a labelled chip.
- In the editor, a formatting mark shows only while the cursor touches it, not on the whole line being edited, so writing a heading or after a bold word no longer reveals the `#` or `**`.
- The Welcome note explains writing with the formatting buttons and `/` instead of Markdown syntax.

## [1.0.0] - 2026-11-05

The first complete release: a private, offline-first notes app with no account or server.

### Writing
- Markdown notes with live preview (formatted outside the line being edited) and a Source view (#34), on the CodeMirror 6 editor (#27).
- Checklists you can tick in the preview, tables, code highlighting (#36), a table of contents and heading anchors (#37), maths with KaTeX (#38, #39), and Mermaid diagrams (#40). Each is loaded only when a note uses it.
- Slash commands (#42), templates and daily notes (#41), and quick notes from any page with Alt+N (#43).
- A command palette, Ctrl+K or ⌘K, also inside the editor (#32, #45).
- Notes save as you type, with history you can restore (#2, #15). Drafts are saved when the page is hidden or closed (#14).

### Organising and linking
- Libraries, shelves, and notebooks (#5, #9, #29), tags, favourites, and pins.
- `[[Wikilinks]]` with suggestions and backlinks (#31), links to sections with `[[Note#Heading]]` (#47), embedded notes with `![[Note]]` (#49), and an offer to update links when a note is renamed (#46).
- A knowledge graph of the whole library, drawn with WebGL, and a relationship explorer around any note (#4, #52).

### Finding
- Search with operators (`tag:`, `notebook:`, phrases, exclusions) (#33), filters (`has:attachment`, `has:task`, `before:`, `after:`), and saved searches (#51).
- Search runs in a background worker in large libraries, so typing stays smooth at 100,000 notes (#50).

### Keeping notes safe
- Trash and restore (#2), and persistent storage requested so the browser does not clear notes (#13).
- Automatic backups to a folder you choose, or reminders to download one (#53). Every backup is proven by restoring it into a test database (#54).
- A repair check at start-up for broken links and orphaned attachments and history (#55).
- Every database upgrade is tested against libraries made by each past version (#56).
- JSON backups that always restore (#12, #16), Markdown export, and imports from Obsidian, Notion, Evernote, Google Keep, Apple Notes, and Markdown folders (#57).

### Everywhere
- Installable on computers and phones, and works offline. Updates are offered with a banner, never forced mid-edit (#59).
- App shortcuts, sharing to the app on Android, and a web clipper bookmarklet (#60).
- In English, Spanish, and Arabic, with a right-to-left layout; notes keep their own writing direction (#64).
- Published at <https://golden-startup-guide.github.io/get-started/>, deployed from `main` once the build passes a smoke test where it is served; the app refuses to run inside other sites' frames (#71).
- Accessible: WCAG 2.2 AA checks on every main screen in CI (#61), keyboard use throughout, and screen-reader labels.

### Quality
- Typing stays within 16 ms per keystroke, even in 1 MB notes (#26, #27, #35), and the editor loads after start-up (#30).
- Fixed the editor dropping keystrokes typed in quick succession (#44), the link picker's slow opening (#22), and focus being taken from a newly opened dialog (#48).
- CI checks lint, unit and end-to-end tests in three browsers, accessibility, size budgets, and Lighthouse scores (#18, #19, #61, #62).
- Decisions recorded, MIT licence, privacy and security policies (#58), and the audit items closed (#11, #63).
- A release process with this changelog, tagged releases, and weekly dependency updates, and a problems log in Settings that sends nothing (#65).
