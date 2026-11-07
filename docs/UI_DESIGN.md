# The Personal Knowledge Library - UI Design

*Superseded: this was the first interface direction. The design specification ([design/peoples-home-spec.md](design/peoples-home-spec.md)) replaced it, and was built as planned in [KNOWLEDGE_LIBRARY_PLAN.md](KNOWLEDGE_LIBRARY_PLAN.md). Where they differ, the specification and the app guide describe the app as it is. For example, the Knowledge Graph is now the note map, and backlinks are **Mentioned in**.*

## Purpose

The Personal Knowledge Library is evolving from a personal note editor into a **Personal Knowledge
Library platform**. This document defines a durable interface direction for
that product so that new libraries, content, and capabilities can grow without
turning the workspace into a crowded notes dashboard.

This is a product and interaction design brief, not an implementation
specification for a particular component library. Future changes should use it
to guide information architecture, responsive behavior, accessibility, and
visual consistency while preserving the application's offline-first and
user-owned-data principles.

## Product framing

The interface should make the knowledge collection feel like the product's
home, with notes as the content units inside it:

```text
Knowledge Library
└── Subject Library
    └── Shelf
        └── Notebook
            └── Note
```

The interface may label the overall collection **Knowledge Library** and
individual collections by subject, such as **Health & Wellbeing** or
**Agriculture**. Libraries are primary navigation destinations rather than
settings or secondary folders. A note remains directly reachable from global
views such as **All Notes**, search, favorites, and linked-note navigation.

The application currently stores notes locally in the browser. The visual
language must not imply public access, shared editing, hosted publishing, or
cloud synchronization until those capabilities are explicitly designed and
implemented.

## Design goals

1. **Orient people quickly.** Always make it clear which library, shelf,
   notebook, or global view they are browsing.
2. **Scale with content.** The navigation should remain useful with many
   libraries and deep or long lists without pushing, clipping, or obscuring the
   reading area.
3. **Keep reading central.** Give note content a calm, legible canvas and make
   organization controls available without competing with the content.
4. **Adapt rather than shrink.** Desktop, tablet, and phone should each have a
   deliberate layout; mobile is not a miniature desktop sidebar.
5. **Protect existing workflows.** Search, all notes, favorites, Trash,
   Markdown editing, attachments, history, note links, and the graph remain
   discoverable as the product grows.
6. **Support inclusive use.** Every navigation, toggle, menu, and content
   interaction must work by keyboard and assistive technology, with visible
   focus and sufficient contrast.
7. **Stay true to local ownership.** Clearly distinguish local storage,
   offline use, and exportable backup from any future sharing or sync feature.

## Information architecture

### Global application frame

The persistent application frame has four regions:

1. **Header:** brand, current location or breadcrumb, global search, and
   primary actions.
2. **Navigation sidebar:** global views and the expandable library hierarchy.
3. **Main workspace:** library landing page, shelf, notebook, search results,
   graph, or note content.
4. **Contextual actions:** actions related to the current object, such as
   rename, move, create, link, export, or delete.

On wide screens, these regions may be visible together. On narrow screens,
they should become focused surfaces rather than squeezed columns.

### Navigation hierarchy

Navigation should be predictable and singular:

- **Global destinations:** All Notes, Favorites, Trash, and Knowledge Graph.
- **Libraries:** the top-level collections that organize subject matter.
- **Shelves:** expandable groups within a library.
- **Notebooks:** destinations within shelves.
- **Tags:** cross-cutting note filters, visually distinct from the hierarchy.

Use breadcrumbs in the main content area for deep locations, for example:

```text
Knowledge Library / Agriculture / Crops / Maize
```

The breadcrumb complements the sidebar; it does not replace the current
location heading. Do not repeat the same full hierarchy in multiple headers.

### Library landing page

A library landing page should answer:

- Which library am I viewing?
- What shelves does it contain?
- How much content is available?
- How do I continue browsing or add material?

Recommended content:

- Library name and a concise description, when descriptions are supported.
- A compact content summary such as shelf, notebook, and note counts.
- Shelf cards or rows, each with a name, description if available, and counts.
- A clear action to open each shelf.
- A visible create-shelf action for people with local editing access.

Avoid presenting a library home as an unrelated collection of generic note
cards. Its primary objects are shelves.

### Shelf and notebook views

- A shelf view presents its notebooks and a short description or note counts.
- A notebook view presents its notes, search/filter context, and notebook
  actions.
- Note cards or rows should communicate title, excerpt, updated date, and
  optional tags or status without making every metadata field equally
  prominent.
- The main action opens a note. Secondary actions such as pin, favorite, move,
  or delete must not intercept the primary open action.

### Search and cross-library discovery

Global search should remain reachable from the application header or a
consistent global control. Results may span libraries, shelves, notebooks,
and tags, but each result should show enough location context to answer
"where does this live?".

Search result location should be a breadcrumb or concise path, not a second
competing title. Any future filters should augment the existing search
experience instead of creating parallel search interfaces for each library.

## Sidebar behavior: required toggle

The sidebar is a first-class, explicitly toggleable part of the application.
It must not be hidden only through hover, viewport guessing, or an inaccessible
gesture.

### Desktop

- The sidebar is visible by default at wide desktop sizes.
- Provide a persistent **Collapse sidebar / Expand sidebar** button in a
  predictable header location.
- In the collapsed state, show a compact icon rail only if each icon has an
  accessible name and a visible tooltip or equivalent label on focus.
- The user can restore the full navigation with the same control.
- The main workspace should reclaim the released width smoothly without
  horizontal overflow.
- Sidebar scrolling is independent of main-content scrolling. Long trees must
  never push the global navigation, main content, or Settings off-screen.

### Tablet

- Use the full sidebar when there is enough width for reading and navigation
  together.
- At intermediate widths, provide a compact/overlay sidebar controlled by the
  same explicit toggle.
- When the sidebar overlays content, provide a clear close control and a
  backdrop. Selecting a destination closes the overlay after navigation.
- Do not allow the sidebar width and the main content to force page-level
  horizontal scrolling.

### Phone

- Use a **menu button** in the top application bar to open the navigation
  drawer. The drawer is closed by default.
- The button has an accessible name such as **Open navigation** and reports its
  expanded state with `aria-expanded` and a relationship to the drawer.
- The open drawer has a visible close button, traps focus while modal, closes
  on Escape, and returns focus to the menu button when dismissed.
- Selecting a destination closes the drawer and places the new page heading
  in view.
- The drawer scrolls independently if its hierarchy exceeds the screen height.
- Tapping outside the drawer closes it; this must not be the only way to close
  it.
- The menu button remains available on every primary destination, including
  note reading and search results.

### Sidebar content rules

- Keep global destinations in a stable section above the library tree.
- Make library and shelf expansion state visible and keyboard operable.
- Use indentation and compact disclosure controls to communicate hierarchy;
  do not rely on color alone.
- Constrain every tree row and control to the sidebar's inner width. Labels may
  truncate, but the full name must remain available to assistive technology
  and, where useful, a tooltip.
- Place notebook move controls on a separate row or in a contextual menu;
  never compress them beside the notebook name, count, and action icons.
- Keep creation controls aligned and width-constrained. Long names must not
  expand the sidebar or overlap the main content.
- Provide a deliberate empty state for a new library or shelf, with a direct
  next action.
- Place Tags and Settings after the scrollable library tree or in stable
  footer regions; do not make them unreachable below an unbounded list.

## Responsive layout guidance

Breakpoints are implementation choices; validate them against actual content
and devices rather than treating these ranges as fixed requirements.

| Class of device | Recommended composition |
|---|---|
| Wide desktop | Expanded sidebar, global header, spacious main content; optional contextual panel |
| Compact desktop / landscape tablet | Collapsible or overlay sidebar, single main content column |
| Portrait tablet | Navigation drawer or compact rail; content takes remaining viewport |
| Phone | Single-column content, top bar with menu toggle, full-screen note editor when useful |

Responsive requirements:

- Use flexible and minimum-zero grid/flex children so note titles, search
  fields, and cards can shrink without overflowing.
- Keep primary actions visible and touch targets comfortably sized on touch
  devices.
- Reflow cards to fewer columns as space decreases; do not shrink card text
  until it is unreadable.
- Present note editor controls in a compact toolbar or stacked layout on
  phones. The editor must not require horizontal scrolling.
- Keep modal dialogs within the available viewport, including safe areas and
  mobile browser chrome. Long dialogs scroll internally.
- Respect device safe-area insets for fixed bottom actions and drawers.
- Verify layouts at narrow phone width, portrait and landscape tablet widths,
  and ordinary laptop/desktop widths, including browser zoom and long
  translated/user-generated names.

## Visual design direction

### Character

Use a calm, readable, editorial visual language: warm neutral surfaces, a
restrained accent color, subtle dividers, and clear typography. The interface
should feel like a well-organized reading and reference environment, not a
busy administrative dashboard.

### Hierarchy and density

- Use one clear page title and a smaller breadcrumb or section label.
- Distinguish navigation, metadata, and primary content with spacing and
  weight before adding more colors.
- Keep library and shelf summaries concise. Let the note itself own the
  strongest typographic emphasis in reading mode.
- Use badges for small, meaningful states (for example pinned or favorite),
  not as decoration for every taxonomy level.
- Prefer consistent spacing and a small set of surface treatments to one-off
  card styles.

### Color and themes

- Preserve the existing Light, Dark, and System theme preference.
- Define semantic colors for canvas, surface, border, primary text, muted text,
  accent, focus, success, and destructive actions.
- Check WCAG AA text contrast in both themes and for interactive states.
- Ensure active navigation and expanded hierarchy are conveyed by more than
  color alone.
- Do not encode subject meaning only as a color; library labels and icons
  remain present.

### Typography and content

- Use readable line lengths for note reading and descriptive library content.
- Make headings visibly distinct from body content and metadata.
- Allow user-generated titles and labels to wrap or truncate safely without
  changing the geometry of neighboring controls.
- Use consistent date, count, and empty-state language.

## Interaction patterns

- **Create:** make the destination explicit (for example, "New notebook in
  Crops") rather than opening an ambiguous global form.
- **Move:** use a labeled menu or dialog that shows the complete destination
  path. Confirm before actions that relocate many descendants.
- **Delete:** explain which notes or notebooks remain and where their
  organization will move. Destructive actions must be distinct and require
  deliberate confirmation.
- **Rename:** keep rename actions close to the object, but avoid always-visible
  icon clusters that crowd navigation rows.
- **Search:** preserve the query when navigating within results if it remains
  relevant; provide a clear reset action.
- **Save:** retain clear Saving/Saved/Unsaved feedback in the editor without
  making local autosave look like cloud synchronization.
- **Link:** show the destination note's location when titles are ambiguous.
- **Offline:** show only actionable network/offline information. Do not show
  cloud-sync status where no sync exists.

## Accessibility requirements

- All visible actions work by keyboard and have a visible focus indicator.
- The sidebar toggle is a button with an accessible name, `aria-expanded`, and
  a controlled-region relationship.
- Expandable library and shelf items expose their expanded state and parent/
  child relationships where appropriate.
- The current destination is identified semantically, for example with
  `aria-current="page"`.
- Mobile drawers follow modal focus behavior; non-modal desktop sidebars do
  not trap focus.
- Preserve logical reading and tab order when layout changes responsively.
- Icons supplement text or accessible names; icon-only controls must have
  labels.
- Dynamic counts, save states, import results, and errors use appropriate
  status announcements without excessive screen-reader chatter.
- Touch interactions have adequate target size and spacing.
- Content remains usable at 200% zoom and with increased text size.
- Test with keyboard-only navigation and at least one screen reader in
  addition to automated checks.

## Growth and future-feature guardrails

Future work should use the existing library hierarchy without adding a new
navigation layer for each feature.

- New library content should appear in library, shelf, notebook, and search
  contexts consistently.
- New global tools should have a clear place in the application frame and
  should not duplicate the library tree.
- New note metadata should be progressive: show the essential detail first
  and expose less-used detail on demand.
- New content types should retain note-like navigation, local storage clarity,
  and predictable backup behavior.
- Features that introduce sharing, permissions, publishing, synchronization,
  or AI must receive separate privacy and product decisions. Their UI must not
  imply such behavior before it exists.
- Do not seed a large subject catalog automatically as part of a visual
  redesign. Starter libraries and data migrations are a separate product
  decision; see [Library Catalog](LIBRARY_CATALOG.md).
- Keep the information architecture usable with one library as well as many.
  Avoid design assumptions that require a fixed number of libraries or
  notebooks.

## Suggested page patterns

### Library home

```text
Global header: menu toggle · breadcrumb · search · create
Main:
  Library title and short purpose
  Optional description and content summary
  Shelves (cards or rows)
  Contextual library actions
```

### Shelf page

```text
Breadcrumb: Knowledge Library / Agriculture / Crops
Shelf title and optional description
Notebooks in this shelf
Notes preview or recent activity where useful
Create notebook in this shelf
```

### Notebook page

```text
Breadcrumb: Knowledge Library / Agriculture / Crops / Maize
Notebook title and actions
Search/filter within the current context
Notes list or responsive card grid
Create note in this notebook
```

### Note reading and editing

```text
Breadcrumb and note title
Readable content canvas
Tags, update date, and notebook context
Related notes / backlinks
Edit, favorite, pin, history, and attachment actions
```

The exact composition can evolve, but each page should keep its location,
primary task, and next navigation step clear.

## Design review checklist

Before merging a future UI or feature change, confirm:

- Does it strengthen the library-first mental model?
- Can a person identify their current library, shelf, and notebook?
- Does it work with many libraries and long user-created names?
- Is every sidebar row and action contained at a narrow desktop width?
- Is the sidebar explicitly toggleable on desktop, tablet, and phone?
- Does the phone layout use a usable navigation drawer rather than a squeezed
  desktop rail?
- Can the hierarchy scroll without hiding Settings or forcing page overflow?
- Are all existing global views and note workflows still discoverable?
- Does the interface remain usable by keyboard, screen reader, touch, and
  zoom?
- Does the UI describe local storage accurately and avoid implying unshipped
  sync or sharing?
- Does the feature preserve current offline and backup expectations?

## Relationship to other project documents

- [Library Catalog](LIBRARY_CATALOG.md) proposes the subject libraries,
  shelves, and notebooks that the interface should support.
- [Complete App Guide](APP_GUIDE.md) describes the current implementation and
  its behavior.
- [Product Roadmap](ROADMAP.md) tracks completed and future capabilities.

