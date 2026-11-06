> **Source document**, kept as received on 6 November 2026. The app is *The Personal Knowledge Library*; *The People’s Home* is the website that will host it. See [../KNOWLEDGE_LIBRARY_PLAN.md](../KNOWLEDGE_LIBRARY_PLAN.md) for decisions and phases.

# The People’s Home
## UI/UX Architecture & Design Foundation

**Version 1.0 · 6 November 2026 · Design specification**  
**Purpose:** A durable, technology-independent blueprint for designing and implementing a calm, offline-first public knowledge library.  

---

## 1. Product design vision

The People’s Home is a living digital library for preserving, organising, connecting, and discovering knowledge. Its primary promise is simple: **help people find a trustworthy place to read, then let the content—not the interface—hold their attention.**

This is a reading environment, not an operational console. Avoid dashboard grids, activity feeds, productivity metrics, file-manager metaphors, dense administration chrome, and social engagement patterns. Every screen should make the knowledge hierarchy legible and keep a clear path back to reading.

The product voice is welcoming, plain-spoken, locally grounded, and non-prescriptive. Use familiar language: **Library → Shelf → Notebook → Note**. Avoid implementation language such as entity, record, asset, or document in public-facing interface copy. Subject areas should feel equally respected; the South African context should be visible through examples, language flexibility, and practical relevance without turning any community into a visual stereotype.

### Experience priorities

1. **Reading is primary.** Give long-form content generous measure, quiet chrome, and stable progress.
2. **Discovery is second.** Curated entry points, useful context, and relationships make exploration inviting.
3. **Writing is third.** When present, authoring should use the same content vocabulary and never overtake reading.
4. **Administration stays out of the way.** Management controls are not part of the reader’s main information architecture.
5. **Offline is a trust promise.** Clearly distinguish what is available on this device from what is not; do not imply synchronisation or availability unless confirmed.

### Success signals for design review

A first-time visitor can name where they are in the hierarchy; a returning reader can resume their last note without hunting; a reader can move from a note to a related note and return without losing position; and each primary task remains possible by keyboard, assistive technology, touch, and zoom. These are design acceptance criteria, not analytics requirements.

---

## 2. Information architecture

```text
Knowledge Library
└── Library (subject domain: e.g., Health & Wellbeing)
    └── Shelf (topic: e.g., Nutrition)
        └── Notebook (curated collection: e.g., Everyday Nutrition)
            └── Note (chapter, article, guide, or handbook page)
```

| Level | Meaning | Typical page contents |
|---|---|---|
| Home | Entrance to the overall knowledge collection | Welcome, continue reading, browse libraries, recently added, offline status |
| Library | Broad subject wing | Description, featured note/notebook, shelves, recent content, counts |
| Shelf | Topic grouping within a library | Introduction, notebooks, continue reading, related shelves |
| Notebook | A coherent, ordered collection of notes | Purpose, contents/chapters, progress, related notebooks |
| Note | The reading destination | Article content, location in hierarchy, progress, previous/next, related notes |

A note has one canonical home in the hierarchy. Relationships can surface it elsewhere without duplicating it. Counts must describe the current level accurately and must not become competitive badges. Empty levels should explain what belongs there and provide a calm next step, not show a dead end.

### Subject library examples

Health & Wellbeing; Agriculture; Financial Literacy; Education & Learning; Community Development; Skills & Careers; Home & Family; South Africa. This list is illustrative and extensible. Library names, count, and ordering must be content-controlled rather than embedded in interface assumptions.

### Content labels

Use content-type labels only when they clarify what a reader will encounter: **Article**, **Guide**, **Chapter**, or **Handbook**. “Note” remains the structural unit and does not require a visible label on every page. Do not introduce taxonomy that competes with the core hierarchy.

---

## 3. Navigation architecture

### Global navigation model

Desktop and tablet use a persistent library rail with: Home, Browse libraries, Search, and a contextual hierarchy tree for the current location. “Continue reading” is an entry point, not a separate content universe. The top bar contains the current page context, a global search affordance, and a restrained theme control. Keep the brand/home destination discoverable at all times.

The breadcrumb is the authoritative location cue: **Home / Health & Wellbeing / Nutrition / Everyday Nutrition / Staying hydrated**. On narrow screens, collapse the breadcrumb to the current title plus a back-to-parent control; expose the full path in an accessible page-location disclosure, not as a tiny scrolling strip.

Search is a single global entry point across libraries, shelves, notebooks, and notes. Results should identify the item’s level and full parent path, make the matched term visible, and allow keyboard movement. Search is a navigation aid, not a separate dashboard. Search-empty and no-match states explain what was searched and provide a clear way to broaden or clear it.

### Context and history

Opening an item updates a stable, shareable location. Back returns to the prior page; within reading, previous/next follows notebook order. These are separate concepts and must not conflict. Continue-reading resumes the last opened note at its saved position. If position is unavailable, open the note at its start without implying that progress was retained.

### Sidebar modes

- **Expanded desktop rail (recommended width 264 px):** brand, global destinations, collapsible library tree, active path, and a modest offline indicator. Tree items use disclosure controls separate from navigation links. Indent by level; do not render thousands of descendants simultaneously.
- **Collapsed desktop rail (72 px):** icon-only global destinations with persistent accessible names and tooltips on hover/focus. The current library tree opens in a temporary adjacent panel. Never rely on icon shape alone.
- **Tablet overlay:** drawer overlays content with a scrim, traps focus only while modal, closes with Escape or explicit close, and returns focus to its opener. Keep page title visible behind or in the drawer header.
- **Mobile navigation drawer:** full-height sheet or edge drawer with clear close button, Home/Browse/Search, then a compact path to the current item. Tap targets are at least 44×44 CSS px as a design target. Drawer scrolling is independent; background scrolling is prevented while open.

The hierarchy may contain thousands of notes. Use progressive disclosure, scoped children, and a “show more” pattern only where the list is genuinely long. Do not load the whole tree into the accessibility tree at once. Preserve current branch and scroll position when closing and reopening navigation.

---

## 4. Page architecture

### Home — the library entrance

**Answer:** Where am I? What can I explore? What was I reading? What is new?

1. Quiet welcome header with one sentence describing the collection.
2. **Continue reading** card with title, notebook/library context, and a restrained progress indicator; one primary action: “Continue reading.”
3. **Explore libraries** as a small, responsive set of subject tiles with one-line descriptions and optional counts.
4. **Recently added** as a short editorial list; date is secondary and human-readable.
5. A subtle offline/device-availability status, only when the state is meaningful.

Do not show KPI tiles, activity charts, “engagement” scores, feeds, or multiple competing CTAs. If there is no reading history, replace Continue reading with a gentle invitation to choose a library.

### Library page — enter a subject wing

Show the library title, concise introduction, optional editorial feature, shelf list, recent content, and counts with meaningful nouns (for example, “6 shelves” and “24 notebooks”). Shelves should be visually distinct enough to browse, with a short description and optional featured item. The page should orient the reader within the whole collection and make one next action obvious without requiring a dashboard scan.

### Shelf page — browse a topic

Show parent path, shelf title, practical introduction, notebook collection, a continue-reading item when applicable, and a small related-shelves section. Notebook cards include title, description, note/chapter count where useful, and progress only for the current reader. Keep card heights natural; avoid uniform boxes that force truncation of explanatory copy.

### Notebook page — understand a collection

Show notebook purpose and scope before its contents. Present chapters/notes as a readable ordered list with title, optional short description, and current progress. Mark the current reading position in both text and visual form. Offer related notebooks only after the main contents. On mobile, contents are the first major section after the overview; do not hide them behind desktop-only side panels.

### Note page — the reading room

The note is the crown jewel. A note page contains:

- A compact breadcrumb and notebook context.
- Note title, optional dek/summary, and modest reading metadata (for example, “5 min read” only if reliable).
- A clear content column with semantic heading levels, paragraphs, lists, quotations, images with captions/alt text, and appropriately labelled callouts.
- A quiet reading-position cue; do not make a progress percentage the dominant element.
- Previous/next links that name the destinations.
- Related notes and backlinks after the main content, never interrupting a paragraph.

Default reading measure: **62–72 characters per line**, body size **18 px desktop / 17 px tablet / 16 px mobile** (user adjustable), line height **1.65–1.8**, paragraph spacing **1.1–1.4 em**. Use a highly legible humanist sans for interface labels and a restrained editorial serif or similarly comfortable text face for long-form body copy. Provide a sans-serif reading option. Avoid justified text, dense sidebars, sticky overlays over text, auto-advancing, and ornamental drop caps that impair scanning.

Reader controls are explicit and reversible: text size, text family, line spacing, content width, and light/dark/soft-paper theme. Changes apply immediately and remain available without requiring a hidden gesture. Preserve note location when adjusting settings. For long notes, a contents outline may be available as a collapsible panel; on mobile it opens as a sheet. Do not let the outline dominate the reading viewport.

### Knowledge relationships

- **Related notes:** 3–5 contextually relevant destinations, each with title, one-sentence reason/context where available, and parent path.
- **Backlinks:** a small list of places that refer to this note; label the relationship in plain language.
- **Knowledge connections:** show a direct, readable list before offering any visualization.
- **Knowledge graph:** optional, approachable map of nearby notes only. Use labeled nodes, clear grouping, keyboard-operable list alternative, zoom/reset controls, and an explicit “return to list.” Never require dragging, color interpretation, or graph reading to reach content. Limit initial scope to a local neighborhood; do not dump a tangled all-library graph.

---

## 5. Responsive experience

Responsive behavior is a change in interaction model, not merely scaled desktop layout.

### Desktop (≥1200 px)

Persistent rail (expanded by default), compact top bar, centered reading column, optional contextual outline at the far right on wide screens. The reader column remains approximately 680–760 px. Side content must never compress body text below a comfortable measure. At 200% zoom, the layout reflows rather than requiring two-dimensional scrolling for ordinary content.

### Tablet (768–1199 px)

Navigation becomes an overlay or compact collapsible rail. Main content occupies the available width with a maximum reading measure. Related content moves below the note or into a deliberate panel. Touch and keyboard behavior remain equivalent. Do not put critical hierarchy context behind hover.

### Phone (≤767 px)

Single-column layout. Use a compact top bar with menu, current location/title, and optional reader controls. Primary navigation is a drawer; avoid a persistent desktop sidebar. Library and shelf collections become stacked editorial rows or two-column tiles only when labels remain readable. Reading controls open as a bottom sheet with labelled controls and a visible close action. Previous/next become full-width, clearly named links. Related notes follow the article. Keep the body column free of floating controls and reserve safe areas around device edges.

### Offline-first communication

Use a small, persistent “Available offline” or “Saved on this device” label only when true. If an item is unavailable offline, state that plainly and identify the consequence before an attempted action. Never use a vague cloud icon as the only signal. Preserve a readable state even when network-dependent material is absent. This specification defines presentation, not sync behavior.

---

## 6. Design system

All values below are foundation tokens, not platform-specific CSS requirements. Validate contrast for every real text/background pairing before release.

### Color tokens — light

| Token | Value | Use |
|---|---|---|
| Canvas | `#F7F5F0` | Warm, low-glare page background |
| Surface | `#FFFFFF` | Cards and reading surface |
| Surface muted | `#EEEAE2` | Quiet selected/secondary panels |
| Ink | `#20241F` | Primary text |
| Ink muted | `#5C625A` | Secondary text and metadata |
| Forest | `#285847` | Primary action, active path, links |
| Forest hover | `#1F493B` | Hover/pressed emphasis |
| Ochre | `#A56722` | Small non-text accent, never sole status cue |
| Border | `#DAD8D0` | Dividers and card outlines |
| Focus | `#146C94` | High-contrast focus ring |

### Color tokens — dark

| Token | Value | Use |
|---|---|---|
| Canvas | `#171A17` | Page background |
| Surface | `#202520` | Cards and reading surface |
| Surface muted | `#2A302A` | Secondary panels |
| Ink | `#F2F0E8` | Primary text |
| Ink muted | `#C1C5BC` | Secondary text |
| Forest | `#9CC9AF` | Links and active elements |
| Forest hover | `#B7D9C5` | Hover emphasis |
| Ochre | `#E7B876` | Accent |
| Border | `#424941` | Dividers |
| Focus | `#82D5F2` | Focus ring |

Use color plus text, shape, or icon for status. Test WCAG AA: normal text contrast at least 4.5:1; large text at least 3:1; meaningful non-text controls and focus indication at least 3:1 against adjacent colors. These are minimums; test actual rendered states and themes.

### Typography

Use system fallbacks and license-cleared fonts. Suggested role pairing: editorial serif for long reading; neutral sans for navigation, metadata, controls, and UI. Typography roles: Library title 36/44 px; Shelf 30/38; Notebook 28/36; Note title 36/44 desktop and 30/38 mobile; chapter heading 26/34; H2 22/30; body 18/30 desktop, fluid down to 16/27 mobile; metadata 13/19 with minimum readable scaling. Values are font-size/line-height. Weight changes should be sparse. Never encode hierarchy by font size alone.

### Spacing and shape

Base spacing unit: 4 px. Common steps: 4, 8, 12, 16, 24, 32, 48, 64, 80 px. Content section spacing: 40–56 px desktop and 32–40 px mobile. Card padding: 20–24 px desktop, 16–20 px mobile. Radius: 8 px controls, 12 px cards, 16 px featured panels. Borders are subtle; shadows are rare and reserved for floating overlays. Touch targets: at least 44×44 CSS px as a product target.

### Motion

Motion is optional, short, and non-essential. Use 120–200 ms for state transitions; no parallax or auto-moving content. Honor reduced-motion settings. Opening a drawer must not delay access to its contents; progress indicators do not animate continuously.

---

## 7. Component system

### Library tile

Title, concise description, optional shelf count; whole tile is a clear link with visible focus. Decorative imagery is optional and never a substitute for subject name. Avoid a color-per-subject scheme that forces users to memorize colors.

### Shelf tile / notebook card

Explicit title and description; optional hierarchy/context line and accurate count. Progress appears only for the current user’s reading and is labelled in text. Make the link target unambiguous and avoid nested clickable actions.

### Navigation tree item

Separate disclosure button and destination link, with accessible name, expanded state, level, position, and set size where meaningful. Active state is conveyed by text/shape as well as color. Indentation has a consistent step and does not make deep nodes unusably narrow.

### Search

Labelled field, visible clear control, predictable results region, status announcements for result count, arrow-key behavior if a listbox pattern is chosen, and Escape to close suggestions. Search keyboard shortcuts are optional, discoverable, and remappable/disableable. Do not intercept typing while focus is in an input.

### Reading controls

Labelled buttons or native controls for text size, font, width, line spacing, and theme. Current value is perceivable to assistive technology. Avoid unlabeled icon-only controls. Keep settings persistent and resettable.

### Empty and unavailable states

Explain what the page represents, what is currently absent, and one relevant route onward. Use calm, literal language. Do not fabricate content, use blame language, or expose technical error codes as the primary message.

### Progress

A low-emphasis bar or textual marker tied to notebook order. Provide a text equivalent such as “Chapter 3 of 8.” Avoid implying completion or proficiency. Do not make progress the only means of finding the current note.

---

## 8. User flows

### First visit → first reading

Home → choose a library → review its description and shelves → open a shelf → understand a notebook overview → choose a note → read. At each step the title and parent path orient the user. Back returns to the prior level without loss of scroll where feasible.

### Return → resume

Home → Continue reading → reopen note at known position → continue reading → use named previous/next links or notebook contents → return to notebook. If position is unknown, resume at the note start and omit progress claims.

### Explore a relationship

Note → related note/backlink → inspect parent path and reason for relation → open destination → browser/app Back returns to the original note and position. Graph is optional and never the only route.

### Search → destination

Open global search → enter a phrase → inspect results with type and full context → open result → breadcrumb confirms location. No results → revise/clear query or browse libraries. Preserve query when returning from a result where possible.

### Mobile navigation

Tap menu → drawer opens and receives focus → choose Home/Browse or expand a library branch → choose destination → drawer closes and focus lands on page heading. Escape/back gesture closes drawer; screen reader announces expanded/collapsed states.

---

## 9. Accessibility and inclusive content

Target **WCAG 2.2 AA** for all supported pages and themes. WCAG requires keyboard operation, contrast, and reflow considerations; the interface must also provide visible focus, meaningful names, semantic structure, and equivalent alternatives for complex visualisations.[3]

- All content and controls are keyboard-operable; no keyboard trap. Use a logical focus order, skip link to main content, visible focus that is not obscured, and focus restoration after dialogs/drawers.
- Use semantic landmarks, one clear page-level heading, ordered heading levels, descriptive link names, and lists for notebook contents. Announce page title after navigation in the chosen application model.
- Provide text alternatives for meaningful images and captions for editorial figures. Decorative imagery is ignored by assistive technology.
- Do not rely on color, position, shape, or gesture alone. Any graph has a textual list alternative. Every drag action has a single-pointer alternative.
- Support text resizing and 200% zoom without clipped controls or horizontal scrolling for ordinary text; test reflow at narrow widths and spacing overrides.
- Maintain readable line length, plain-language labels, explicit error recovery, and stable controls. Avoid time limits and surprise context changes.
- Respect OS high-contrast and reduced-motion settings; support dark theme without lowering contrast.
- Write dates, measurements, and South African terminology consistently and expand uncommon abbreviations on first use. Plan for multilingual content without assuming English-only text expansion or font coverage.
- Test with keyboard only, screen readers (NVDA/Firefox or Chrome, VoiceOver/Safari), browser zoom, touch, and at least one high-contrast mode. Accessibility sign-off is based on manual and automated testing; automated checks alone are insufficient.

The cited W3C standard is the normative source for conformance details.[3]

---

## 10. Wireframes and visual mockups

The companion file `mockups.html` is a static, editable visual concept set with desktop, tablet, and phone views. It illustrates Home, a Library/Shelf browsing pattern, and a Note reading view. It is not a functioning application and does not define data or implementation. Use it to discuss hierarchy, spacing, reading focus, and responsive transformation. The wireframes below define page order independently of the mockup styling.

### Home wireframe

```text
┌──────────────┬──────────────────────────────────────────────┐
│ Brand        │ Home                         Search   Theme │
│ Home         ├──────────────────────────────────────────────┤
│ Browse       │ Welcome to The People’s Home                │
│ Search       │ A calm, shared place to explore useful knowledge.
│              │                                              │
│ LIBRARIES    │ ┌ Continue reading ───────────────────────┐ │
│ Health       │ │ Everyday Nutrition · Chapter 3 of 8     │ │
│ Agriculture  │ │ Staying hydrated             Continue → │ │
│ ...          │ └────────────────────────────────────────┘ │
│              │ Explore libraries                           │
│              │ [Health] [Agriculture] [Financial literacy] │
│              │ Recently added                               │
│              │ Note title · Library / Shelf · date          │
└──────────────┴──────────────────────────────────────────────┘
```

### Note wireframe

```text
┌──────────────┬──────────────────────────────────────────────┐
│ Library tree │ Home / Health / Nutrition / Everyday Nutrition│
│              │                                              │
│              │ Staying hydrated                             │
│              │ A practical guide to everyday hydration.     │
│              │ Guide · 5 min read                            │
│              │                                              │
│              │ [Comfortable reading column, 680–760 px]     │
│              │ Chapter heading                              │
│              │ Body paragraph with generous line height...  │
│              │                                              │
│              │ Previous: Water through the day  Next: Signs │
│              │ Related notes · Backlinks                     │
└──────────────┴──────────────────────────────────────────────┘
```

### Mobile note wireframe

```text
┌──────────────────────────┐
│ ☰   Staying hydrated  Aa │
│ Nutrition / Everyday ... │
│                          │
│ Staying hydrated         │
│ Practical guide          │
│                          │
│ [Readable single column] │
│ Body text with generous  │
│ line spacing and margins │
│                          │
│ Previous note            │
│ Next note                │
│ Related notes            │
└──────────────────────────┘
```

---

## 11. Developer handoff guidance

Treat this document as the product-level design contract. Preserve the library hierarchy, reading-first priorities, named states, and accessibility requirements when adapting to any framework or device. Map tokens to the implementation’s native token system; do not hard-code colors, spacing, or typography independently in every component.

Separate information architecture from navigation rendering. Model parent-child structure and cross-note relationships distinctly. A related-note link must not imply a second canonical parent. Keep content semantics in the markup, with styles that do not substitute for meaning. The interface should not assume every library has identical numbers of shelves or every note has identical metadata.

Before implementation, confirm actual content examples, translation requirements, persistence semantics for progress/preferences, offline state definitions, and the source of “recent” ordering. Where those decisions are unresolved, present truthful neutral states rather than inventing behavior. This brief does not specify APIs, database schemas, synchronisation, identity, editorial permissions, or AI.

### Handoff acceptance checklist

- [ ] A new user understands the Library → Shelf → Notebook → Note hierarchy.
- [ ] Home answers location, exploration, resume, and new-content questions without KPI dashboard styling.
- [ ] Library, Shelf, Notebook, and Note each have the specified content order and hierarchy cues.
- [ ] Reading remains comfortable at phone, tablet, desktop, and 200% zoom.
- [ ] Sidebar supports expanded, collapsed, tablet overlay, and mobile drawer states.
- [ ] Search results show item type and parent context; no-result state offers a recovery route.
- [ ] Related content and graph have readable, keyboard-accessible list alternatives.
- [ ] Light and dark themes pass contrast checks for actual text, controls, focus, and disabled states.
- [ ] Keyboard-only completion, screen-reader semantics, touch targets, focus return, and reduced-motion behavior are verified.
- [ ] Offline messaging reflects verified availability and never promises unimplemented behavior.
- [ ] No AI, social network, chat, voice/video call, or dashboard feature has been added.

---

## 12. Future expansion rules

New libraries may be added without changing the four-level hierarchy. New note formats may add semantic blocks (for example, a recipe-like guide or a field checklist) but should retain a readable linear representation, accessible headings, and stable note navigation. New relationship types must name the relationship in plain language and preserve a direct list alternative. New themes must reuse semantic color roles and meet contrast requirements. New viewport classes must retain reading measure and navigation parity.

Do not add a new hierarchy level merely to solve a visual grouping problem; test whether an existing library, shelf, notebook, or note can express the concept. Do not add badges, interaction patterns, or content types solely because a new capability exists. The stable test is whether the change improves preservation, organisation, connection, or discovery while keeping reading primary.

---

## References

Design cues are distilled from public product descriptions and are not an attempt to copy proprietary interfaces. Apple describes curated collections and resuming reading across devices; Kindle documents user control over type size, weight, line and word spacing, margins, and themes.[1] [2] Accessibility targets are based on W3C WCAG 2.2.[3]

[1]: https://www.apple.com/apple-books/ "Apple Books"  
[2]: https://www.amazon.com/gp/help/customer/display.html?nodeId=T5Y94BzSCGwm0vd75W "Customize Your Kindle E-Reader Text Display"  
[3]: https://www.w3.org/TR/WCAG22/ "Web Content Accessibility Guidelines WCAG 2.2"
