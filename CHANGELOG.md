# Changelog

All notable changes to The Personal Knowledge Library (called My Notes up to 1.1.0). Versions follow [semantic versioning](https://semver.org/):
a **major** version may need something from you (a new backup format, say), a **minor** version
adds features, and a **patch** fixes problems. The app updates itself, asking first; see
[docs/RELEASING.md](docs/RELEASING.md) for how releases are made.

## [Unreleased]

## [1.2.0] - 2026-11-07

The Personal Knowledge Library: a library of eight illustrated handbooks to read, offline, beside your own notes.

### Added
- **The handbooks**: eight libraries (Health & Wellbeing, Agriculture, Financial Literacy, Education & Learning, Community Development, Skills & Careers, Home & Family, South Africa), 49 practical, South African pages, each listing its sources. They are marked as drafts until reviewed by qualified people.
- **A picture on every handbook page**: 49 simple drawings showing what the page explains, each described for people who cannot see it, downloaded with the handbooks so they show offline. The build refuses a handbook page without one.
- **Relationships** on handbook pages: **Mentioned in** (what links to the page) and **Related notes**, each with a plain reason, and **Show on the note map**.
- **The note map** (formerly Knowledge Graph) opens around a note, with handbook notes included, zoom and reset buttons, and **Skip to the list**; the same notes are always listed below it. The whole-library view is offered second. "Backlinks" are now called **Mentioned in**.
- A third placeholder page in Everyday Nutrition, "Signs of dehydration" (a draft, with a warning to get help).
- **Search** for the whole library: one search across the handbooks' libraries, shelves, notebooks, and notes and your own notes, each result saying what it is and where it sits, with the words marked. Back returns to the results; when nothing matches, it offers a way on.
- **The reading room** for handbook notes: one column at a comfortable line length, **Reading settings** for text size, style, line spacing, line length, and theme (remembered, and resettable), your place in each note remembered, **Previous** and **Next** by name, a quiet progress bar, and a reading time for longer notes.
- **Callouts**: a quote starting with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` becomes a labelled box, in handbooks and in your own notes.
- **Library, shelf, and notebook pages** made for reading: counts that name what they count, shelves and notebooks with their descriptions, Continue reading where you left off, related shelves and notebooks, and a handbook notebook's numbered contents with your last-read note marked. Managing your own libraries and shelves moves to a **Manage** section at the end of their pages.
- The sidebar opens the branch you are on and small libraries; large ones start closed, so it stays short as the library grows.
- **Home**, the new start page: Continue reading (the note you opened last, and where it sits), tiles to explore the libraries, Recently added, and whether the app is available offline. All Notes moves to its own address, `#/notes`, and the breadcrumb starts at Home.
- **Built-in handbooks**: Health & Wellbeing, Agriculture, and Financial Literacy, listed under Handbooks in the sidebar and readable offline from the first launch. They are read-only; **Make a personal copy** or **Write a note about this** to work with one, and link to them from your notes with `[[Title]]`. The first handbooks are short drafts, labelled as such.
- The app remembers the note you opened last, for "Continue reading" on the coming Home page (database version 7; upgrades are automatic).
- Every page and note has its own address, so **Back** and **Forward** work, a reload keeps your place, and pages can be bookmarked. A missing page or note is explained rather than shown blank.
- A breadcrumb on every page; on phones, a link up a level and a **Page location** button.
- The collapsed sidebar becomes a rail of named icons instead of disappearing, and a **Skip to main content** link comes first.
- A **Soft paper** theme for long reading. Older versions read its backups as the light theme.

### Changed
- New libraries start with the handbooks and one Welcome note in a personal library called **My notes**, instead of five starter notebooks and notes. Existing libraries are unchanged.
- The app is now **The Personal Knowledge Library**, the first step of the plan in [docs/KNOWLEDGE_LIBRARY_PLAN.md](docs/KNOWLEDGE_LIBRARY_PLAN.md). Messages say "the app" in place of the old name. Your notes, settings, and backups are unchanged.
- New colours from the design specification: warm paper, forest green, and a blue focus ring, in light and dark. Every pairing is checked against WCAG 2.2 AA.
- Titles and note text use a serif for easier reading.
- The sidebar is 264 px wide; tablets up to 1199 px use the navigation drawer. On phones, the page title and its location sit under the header buttons with the full width.

### Fixed
- Closing a note after following a link inside it (or Previous, Next, or Back) returns focus to where you opened it, not to the **New note** button.
- Home promises offline reading only once the app is saved on the device.
- Jumping to a section from **Contents** no longer scrolls smoothly when the system asks for less motion.
- In Windows Contrast themes, the current page, the chosen option, focus on menu items, and the reading progress stay visible.

### Accessibility and acceptance
- The design specification's acceptance checklist is recorded item by item in [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md), with new checks for a keyboard-only journey, tablets, high contrast, and reduced motion. It also guides the checks that need people: screen readers, a usability session with readers, and the handbooks' review.

### Documentation
- The README, roadmap, guide, plan, catalog, privacy policy, and translation notes describe the app as it is in 1.2.0, with screenshots of Home and the reading room. Older documents written for My Notes say so at the top.
- Two decisions are recorded in [docs/DECISIONS.md](docs/DECISIONS.md): the handbooks come with the app, read-only (9), and there are no AI, chat, social, or dashboard features (10). The roadmap's old AI items are marked as not planned.

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
