# Changelog

All notable changes to My Notes. Versions follow [semantic versioning](https://semver.org/):
a **major** version may need something from you (a new backup format, say), a **minor** version
adds features, and a **patch** fixes problems. The app updates itself, asking first; see
[docs/RELEASING.md](docs/RELEASING.md) for how releases are made.

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
- Accessible: WCAG 2.2 AA checks on every main screen in CI (#61), keyboard use throughout, and screen-reader labels.

### Quality
- Typing stays within 16 ms per keystroke, even in 1 MB notes (#26, #27, #35), and the editor loads after start-up (#30).
- Fixed the editor dropping keystrokes typed in quick succession (#44), the link picker's slow opening (#22), and focus being taken from a newly opened dialog (#48).
- CI checks lint, unit and end-to-end tests in three browsers, accessibility, size budgets, and Lighthouse scores (#18, #19, #61, #62).
- Decisions recorded, MIT licence, privacy and security policies (#58), and the audit items closed (#11, #63).
