# The Personal Knowledge Library: plan

**Status:** Built. Planned on 6 November 2026; all ten phases were delivered by 7 November 2026 (pull requests #77 to #88) and released as 1.2.0. Where a phase was built differently from its plan, its **As built** note says how. What still needs people is in [ACCEPTANCE.md](ACCEPTANCE.md).
**Design source:** [design/peoples-home-spec.md](design/peoples-home-spec.md) (UX specification v1.0) and
[design/peoples-home-mockups.html](design/peoples-home-mockups.html) (static concepts). The
specification PDF that came with them has the same text as the Markdown copy.

This plan turns My Notes, a private notes app, into **The Personal Knowledge Library**: a library
that reads first, ships with curated handbooks, and still lets people keep private notes of their
own. It covers the decisions already made, how the specification maps onto today's app, and the
phases of work. Each phase is one pull request, merged only when the owner approves it.

## Decisions

| Question | Decision |
|---|---|
| Where does the library's content come from? | **It is bundled with the app.** Curated handbooks ship with the app, work offline from the first launch, carry a version, and are read-only. The bundled content is part of the product, not sample data. Downloadable content packs come later. |
| Name | **The Personal Knowledge Library** is the app. **The People's Home** is the name of the website that will host it, so the app never uses it as its own name. |
| Writing | **Kept, but secondary.** Reading and discovery lead. The editor, quick notes, templates, daily notes, and the command palette stay, under a clear area for writing. |
| Delivery | **Phased pull requests**, listed below. Each is reviewed and merged on request. |
| Server, licence, hosting | Unchanged ([DECISIONS.md](DECISIONS.md)): no server, MIT licence, GitHub Pages. |

### The shape of the library

```text
Knowledge Library
├── Built-in libraries          (ship with the app · curated · offline · versioned · read-only)
│   ├── Health & Wellbeing
│   ├── Agriculture
│   ├── Financial Literacy
│   ├── Education & Learning
│   └── …
└── Personal libraries          (created by the reader · editable · private · can link to handbooks)
    ├── My Research
    ├── My Journal
    └── …
```

Both kinds use the same four levels: **Library → Shelf → Notebook → Note**. A personal note can
link to a handbook note, and a handbook note shows those links as backlinks, on this device only.
Handbook notes cannot be edited in place. **Make a personal copy** creates an editable note, and
**Write a note about this** creates a personal note that links back to the handbook note.

## What changes, and what stays

| Area | Today | After this plan |
|---|---|---|
| First launch | Five starter notes in an otherwise empty library | A fully stocked library: Home, built-in libraries, handbooks ready to read offline |
| Opening screen | "All Notes" card grid | **Home**: welcome, continue reading, explore libraries, recently added, offline status |
| Locations | App state only; Back leaves the app | Every page has its own address, so Back, Forward and links work, and a breadcrumb shows the location |
| Reading a note | Side-by-side editor and preview | **Reading room**: a serif column of 680–760 px, reader controls, previous and next by name, related notes after the text |
| Writing | The main activity | Still available: an **Edit** button on personal notes, and **New note** in personal libraries |
| Look | Warm terracotta accent, sans text | Spec tokens: warm paper, forest green, ochre, a focus blue; light, dark, and soft-paper themes; serif for reading |
| Sidebar | A tree of the user's libraries | Rail: Home, Browse libraries, Search, and the tree for the current location. It is 264 px expanded and 72 px collapsed, an overlay on tablets, and a drawer on phones |
| Search | Searches personal notes, shows cards | Searches built-in and personal content; each result shows its level and full path |
| Graph | The whole library at once | A map of nearby notes around one note, with a list alternative, as the spec requires |
| Favourites, pins, tags, trash, history, backups, importers, export | Present | Kept for personal content. Backups never include built-in content |
| Translations (Spanish, Arabic with right-to-left) | Interface | The interface stays translated. Handbook content is in English first ([Settled questions](#settled-questions)) |

Things that must not change: existing users' notes and settings, the IndexedDB database name
(`my-notes`), and the backup format. A backup made before this plan must restore after it. An
existing user's libraries become **Personal libraries** without any action from them.

## Phases

Each phase lists its result, the main work, and how we will know it is done. Every phase keeps
CI green: unit tests, end-to-end tests in three browsers, axe accessibility checks, size budgets,
and Lighthouse. Each phase also updates the changelog and [APP_GUIDE.md](APP_GUIDE.md).

### Phase 1: Name, tokens, and type

- **Result:** the app is called The Personal Knowledge Library and uses the specification's colours and type, with nothing else changed.
- **Name:** rename the app in the interface, the page title, the install manifest (short name "Knowledge Library"), icons, translations, and the docs. Keep the database name, storage keys, and backup format.
- **Colours:** add the specification's colour tokens (section 6) as CSS custom properties for light and dark, plus a **soft-paper** theme. Replace the scattered hard-coded colours, such as `#b45d4d`, with the tokens.
- **Type:** serif for reading and sans for the interface, using system font stacks only. Web fonts would add download weight and a network dependency.
- **Done when:** a unit test checks the contrast of every real text and background pair in all three themes against WCAG 2.2 AA. The existing axe checks pass, and screenshots are reviewed.
- **As built:** the install manifest uses the full name, The Personal Knowledge Library, as its short name too. Soft paper is stored as the light theme with `paper: true`, so backups stay compatible.

### Phase 2: Addresses, breadcrumb, and the navigation rail

- **Result:** every library, shelf, notebook, note, search, and Home has an address. Back and Forward work, and the location is always clear.
- **Routing:**
  - Use hash routes such as `#/library/<id>`, `#/note/<id>`, and `#/search?q=`. They work on GitHub Pages and offline without any server rewrites.
  - The current `View` state becomes a function of the address.
  - Old launch links, from shortcuts, the share target, and the clipper, keep working.
- **Breadcrumb:** `Home / Library / Shelf / Notebook / Note`. On phones it collapses to a back-to-parent link plus a **Page location** disclosure.
- **Rail:** the four sidebar modes from section 3 of the spec, with a skip link. After navigating, focus moves to the page heading. Disclosure buttons are separate from links in the tree. Rendering only the current branch moves to phase 5: today's tree lists libraries, shelves, and notebooks but never notes, so it stays small until handbooks add many more notebooks.
- **Done when:** end-to-end tests cover Back and Forward, deep links that survive a reload, the drawer focus trap and focus return, and Escape closing the drawer.

### Phase 3: Built-in content

- **Result:** handbooks ship with the app, are read-only, and work offline from the first launch.
- **Content files:** a `content/` folder with one folder per library. The library, shelf, and notebook descriptions live in small index files, and notes are Markdown files with front matter:
  - a stable `id`;
  - `title` and `summary`;
  - `type` (Article, Guide, Chapter, or Handbook);
  - `order`;
  - `added`, the date it was added;
  - for sensitive subjects, `reviewed` (who reviewed it and when).
- **Build:** a build step checks the content (unique ids, links that resolve, required fields) and compiles it into one JSON chunk per library, stamped with a content version.
  - The chunks are precached, so everything is readable offline.
  - The size budget gets a separate, explicit **content** line, so the app's own size is still guarded.
- **Model:** built-in items are read from the bundle and never stored in IndexedDB, so an update replaces them cleanly.
  - Each item carries `source: 'core'`.
  - Editing actions are hidden for core items, and the stores reject edits to them.
  - Backups and Markdown export include personal content only. A separate **Save this handbook** export is possible later.
- **Reading data:** a new `reading` store holds the last note opened, the reading position per note, and the reader settings. This is a database version bump with a migration fixture, following the current upgrade-fixture practice.
- **First launch:** moved to phase 4, with the new Home page: new libraries will no longer get the five starter notes, but one personal **Welcome** note that explains writing, inside a personal library called **My notes**.
- **Done when:**
  - content validation runs in CI;
  - an offline end-to-end test opens a handbook note with the network off;
  - a backup made before this phase still restores;
  - personal notes can link to handbook notes.
- **As built:** each library's notes compile to a small JavaScript module (`assets/core-<id>-<hash>.js`) rather than a JSON file, served through `virtual:core-content`. The reader settings ended up with the other settings rather than in the `reading` store (see phase 6). Handbook pictures, added later, are copied to `assets/picture-*` and counted in the same content budget.

### Phase 4: Home, the library entrance

- **Also:** the first-launch change moved here from phase 3 (one Welcome note in **My notes** instead of five starter notes), and the opening screen's largest paint (about 3.2 s on Lighthouse's mobile preset) is brought down, since Lighthouse performance sits close to its 0.9 minimum.

- **Result:** the opening screen answers four questions: where am I, what can I explore, what was I reading, and what is new.
- **Sections, from section 4 of the spec:**
  - a quiet welcome;
  - **Continue reading**, or an invitation to choose a library when there is no reading history;
  - **Explore libraries** tiles, built-in first, then personal;
  - **Recently added**, from the content's `added` dates and new personal notes;
  - an offline status shown only when it is true and meaningful.
- **No dashboard:** no counts styled as scores, feeds, or charts.
- **The "All Notes" grid** keeps its name and moves to its own address, `#/notes`; "My notes" is the name of the personal library new installs start with.
- **Done when:** end-to-end tests cover a first visit, a return visit, and the empty-history case.

### Phase 5: Library, shelf, and notebook pages

- **As built:** the optional featured item on a library page is left out until handbooks carry editorial data to choose it from. Personal notebooks keep their card grid with search (their notes have no reading order); handbook notebooks get the ordered contents. The tree opens the current branch and small libraries (up to 8 notebooks) or shelves (up to 12), and draws nothing inside closed ones.

- **Result:** each level has the content order from section 4 of the spec.
  - A **library** has an introduction, an optional featured item, its shelves, and recent content, with counts that name what they count ("6 shelves").
  - A **shelf** has an introduction, notebooks with natural-height cards, continue reading, and related shelves.
  - A **notebook** has its purpose, then an ordered contents list ("Chapter 3 of 8") with the current position shown in text and visually, then related notebooks.
- **Personal libraries:** the same pages, plus creating, renaming, moving, and deleting. These actions reuse today's dialogs and menus, kept out of the reading path.
- **Done when:** every level is keyboard-, screen-reader-, and phone-tested, and the empty levels explain what belongs there and offer one next step.

### Phase 6: The reading room

- **As built:** the reading room is for handbook notes. Personal notes still open in the editor (which has a **Preview only** view), since changing how they open would change every writing flow; an Edit-first reading view for them can follow if wanted. The outline is the collapsible Contents list at the top of a long note, on every screen size, rather than a separate panel or sheet. On phones the line is shorter than 62 characters, since the screen is; the 62–72 measure is checked at desktop and tablet widths. Reader settings are kept with the other settings, so they are in backups (and older versions ignore them); reading positions stay on the device.

- **Result:** the note page from section 4 of the spec.
- **Header:** a compact breadcrumb and the notebook's context, then the title, the summary, and modest metadata. The reading time is shown only when it is reliable.
- **Text:** semantic content from the existing Markdown renderer, including callouts, which are new.
- **After the text:**
  - a quiet position cue;
  - previous and next links that name their notes;
  - related notes and backlinks, never in the middle of the text;
  - on long notes, an outline in a collapsible panel, which becomes a bottom sheet on phones.
- **Reader controls:** text size, font (serif or sans), line spacing, width, and theme.
  - They take effect immediately, persist, and can be reset.
  - The reader keeps their place when a setting changes.
  - The controls are a panel on wider screens and a bottom sheet on phones.
- **Position:** the reading position is saved and restored. When the position is unknown, the note opens at its start without any claim about progress.
- **Writing:**
  - Personal notes have an **Edit** button that opens the existing editor, with its formatting bar and live preview.
  - Handbook notes offer **Make a personal copy** and **Write a note about this**.
- **Done when:** the measure is 62–72 characters at default settings on desktop, tablet, and phone, and nothing scrolls sideways at 200 % zoom.

### Phase 7: Search

- **As built:** a Search page (`#/search`) in the sidebar and rail. Handbook notes and places are matched on the page itself (there are few, and they need no worker); personal notes are still searched by the worker in large libraries. Results are a list of buttons rather than an arrow-key listbox, so the keyboard moves through them with Tab. The search clears when leaving the page, and Back restores it from the address. Lists of your notes keep their own search field, now with a plain placeholder; the operators are in its tips.

- **Result:** one search covers both built-in and personal content.
  - Each result shows its level (Library, Shelf, Notebook, or Note), its full path, and the matched words.
  - Results can be browsed with the keyboard, and the number of results is announced.
  - The query is kept when the reader comes back from a result.
  - When nothing matches, the page says what was searched and offers to clear the search or browse the libraries.
- **Operators:** the existing ones (`tag:`, phrases, exclusions) keep working for people who know them, but they are not shown first.
- **Indexing:** the search worker indexes the content chunks as well as IndexedDB.
- **Done when:** end-to-end tests cover a search that leads to a destination, with the breadcrumb confirming the location, and a search with no results that offers a way back.

### Phase 8: Relationships and the local map

- **As built:** Mentioned in and Related notes are on handbook pages (the reading room); your own notes keep their Linked notes section in the editor, where "Backlinks" is now "Mentioned in". The whole-library graph is kept as the map's second view rather than removed, offered only where WebGL 2 can draw it; the sidebar item is now **Note map** and opens around a note. Related notes leave out pages that mention the note (listed under Mentioned in) and the notes already named as Previous and Next, so with the three placeholder pages, which all link to each other, the list is empty until there is more content.

- **Related notes:** 3–5 per note, each with a plain reason, such as "In the same notebook", "Links here", or "Shares the topic Nutrition", and its path. They are computed from links, notebooks, and tags.
- **Backlinks:** labelled in plain language, such as "Mentioned in".
- **Local map:** the graph view becomes a map of the notes near one note.
  - It has labelled nodes, zoom and reset buttons, and a **Return to list** link.
  - The same neighbourhood is also available as a list.
  - The map is never the only way to reach a note.
  - The graph of the whole library is removed from the main navigation.
- **Done when:** every note reachable on the map is also reachable from the list by keyboard alone.

### Phase 9: The first handbooks

- **As built (owner's decision, 7 November 2026):** all eight libraries written in full from researched public sources (government departments, WHO, NCR, IEC, SASSA, Home Affairs, NASASA, UNICEF, and others), 49 pages in 16 notebooks, each ending with a **Sources** list for reviewers. Every page keeps `draft: true` ("Draft: not yet reviewed") until the owner's professional reviewers check the working app; reviewed pages then get `reviewed:` and lose `draft`. Amounts that change yearly (grant amounts, income limits) are not quoted; pages point to the official source instead. To keep the start-up script within budget as content grows, the library, shelf, notebook, search, and note map pages now load just after start-up in one precached chunk.

- **Result:** the libraries are stocked. Content is written in plain, South African-grounded English for the libraries in section 2 of the spec. A first release might have eight libraries, each with one or two shelves, one or two notebooks per shelf, and three to eight notes per notebook, about 60–100 notes in all.
- **Writing and review:** content can be drafted with help, but **health, financial, and legal-adjacent notes need review by a qualified person before release**. The `reviewed` field records who reviewed them, and notes without a review stay out of the release build.
- **Calm guidance:** callouts give guidance such as "Follow advice from a qualified health professional", as in the mockups.
- **Done when:** the content validation passes, every note has a summary and a type, and a review is recorded where one is needed.

The four content-free phases (1, 2, 4, and 5) can start before the handbooks are written, using a
small set of placeholder handbook notes clearly marked as drafts. Phase 9 replaces those notes.

### Phase 10: Acceptance

- **Checklist:** the handoff acceptance checklist in section 11 of the spec, item by item.
- **Accessibility sign-off:** a manual screen reader pass with NVDA and Firefox, and with VoiceOver and Safari, plus a high-contrast mode check. These need a person; automated checks are not enough.
- **Usability:** a session with 3–5 non-technical readers covering the spec's success signals: they can say where they are, resume reading, follow a related note and come back, and do all of this with a keyboard, touch, and zoom.
- **Release:** a minor version, with notes in the changelog.
- **As built:** the checklist is recorded in [ACCEPTANCE.md](ACCEPTANCE.md), every item with its evidence. New end-to-end checks (`e2e/acceptance.spec.ts`) cover a keyboard-only journey, tablets, high contrast, and reduced motion.
  - Four problems were found and fixed: focus return after moving between notes, an offline promise made too early, smooth scrolling under reduced motion, and backgrounds lost in high contrast.
  - The release is 1.2.0.
  - The screen reader pass, the usability session, and the handbooks' review need people. ACCEPTANCE.md guides each one and has tables for the results.

## Not planned

The specification rules these out, and this plan keeps them out:
- AI features: no assistants, generated summaries, or chat with notes;
- communication: no chat, comments, voice, or video calls;
- social features: no profiles, likes, follows, or shares to a feed;
- dashboards: no activity feeds, scores, streaks, or charts of reading.

A proposal for any of these needs a new decision in [DECISIONS.md](DECISIONS.md) first.

## Risks

- **Download size.** Handbooks are precached, so every installed reader downloads all of them.
  - Text compresses well: about 100 notes is roughly 200–400 KiB of JSON before compression.
  - Images must be few, small, and optimised, with a separate budget.
  - Content packs (later) are the way to grow beyond this.
- **Content quality and liability.** Health and money guidance can cause harm if it is wrong. The required review field, careful wording, and pointers to professionals are the controls.
- **Existing users.** Their data must not move or change meaning. Phase 3 carries a migration fixture and a backup round-trip test.
- **Scope of test changes.** Most end-to-end tests assume "All Notes" opens first. Phases 2 and 4 update them as they change navigation, never by weakening what the tests check.
- **Performance at scale.** The 20,000-note targets in [PERFORMANCE.md](PERFORMANCE.md), for typing, search, and the grid, still apply to personal content, and the rail must not render whole trees.

## Settled questions

These were open when the plan was written; the defaults in brackets were proposed then.

1. **Content authorship:** [Claude drafts them, and the owner arranges a qualified review for health and finance.] **Settled that way.** All pages were researched and written from public sources, listed on each page. The owner will send the app to professionals to review, and every page stays a draft until reviewed ([ACCEPTANCE.md](ACCEPTANCE.md#3-reviewing-the-handbooks)).
2. **Content languages:** [English first; content files allow translations later.] **Settled that way.** The app itself is in English, Spanish, and Arabic.
3. **Reading time:** [Yes, from word count, rounded, and only above two minutes.] **Built that way.**
4. **Recently added:** [Both, built-in first.] **Built that way.**
5. **Reading data in backups:** [Settings yes, positions no.] **Built that way.**
6. **Pictures:** added on 7 November at the owner's request: every handbook page has a picture, and the build refuses a page without one.
