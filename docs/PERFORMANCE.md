# My Notes - Performance Baseline

**Date:** 2026-11-01
**Status:** Baseline recorded before any performance work; causes 1 (the link picker) and 2 (rendering every card) have since been fixed, see [Progress](#progress). Targets come from [the architecture vision](ARCHITECTURE_VISION.md), section 3E.

## How it is measured

`npm run bench` builds the app, serves the production build, and runs `bench/library.bench.ts` in Chromium with one worker. For each library size it:

1. Generates a reproducible library with `bench/seedLibrary.ts` and writes it straight into IndexedDB. Backup import cannot be used: 100,000 notes exceed the 40 MiB backup limit. Each library contains:
   - 3 libraries, 12 shelves, 60 notebooks, and 150 tags;
   - about 1.5 links per note, and history on every 10th note;
   - notes with Markdown paragraphs, some headings and checklists;
   - one 1 MB note;
   - a rare word planted in exactly every 100th note, so search results have a known count.
2. Measures:
   - **Cold start:** a fresh page load until the full note list has rendered.
   - **Search:** typing the rare word until the result count updates.
   - **Open a note:** clicking a typical note until the editor is shown.
   - **Open the 1 MB note:** the same, for the large note.
   - **Typing p95:** the 95th-percentile time from a keydown until the frame after it renders, while typing in the 1 MB note.
   - **JS heap and DOM nodes** after the cold start.

Results are written to `bench/results/` (ignored by git) and summarised with `node bench/report.mjs`. They report against the targets but do not fail; set `BENCH_ENFORCE=1` to fail on a miss. Choose sizes with `BENCH_SIZES`, for example `BENCH_SIZES=1000,10000 npm run bench`.

The **Benchmarks** GitHub Actions workflow runs the same suite by hand (Actions tab), and on pull requests that change the benchmarks. It writes the table to the run summary and uploads the JSON results.

## Baseline

**Reference: GitHub Actions** (`ubuntu-latest`, headless Chromium 156), from the first Benchmarks workflow run on PR #21.

Shared CI machines vary between runs: a second run of the same code measured up to about 2× slower (for example, opening a note at 10,000 notes took 24 s, then 47 s). Treat a single run as a rough measure. Compare a change by running the workflow two or three times and looking for consistent, large differences; the fixes recommended below should change results by orders of magnitude, well beyond that noise.

| Measure | Target | 1,000 notes | 10,000 notes |
|---|---|---|---|
| Cold start | ≤ 1,000 ms | 417 ms ✅ | 3,450 ms ❌ |
| Search | ≤ 50 ms | 91 ms ❌ | 506 ms ❌ |
| Open a note | ≤ 50 ms | 486 ms ❌ | 24,092 ms ❌ |
| Open the 1 MB note | - | 1,215 ms | 23,136 ms |
| Typing p95, 1 MB note | ≤ 16 ms | 312 ms ❌ | 7,898 ms ❌ |
| JS heap | - | 18.4 MB | 77.6 MB |
| DOM nodes | - | 22,330 | 189,121 |

**Development PC** (Windows, headless Chromium 156), which was visibly under load during testing. It is 3–5× slower than CI with the same pattern; compare runs on the same machine only.

| Measure | Target | 1,000 notes | 10,000 notes |
|---|---|---|---|
| Cold start | ≤ 1,000 ms | 1,416 ms ❌ | 11,394 ms ❌ |
| Search | ≤ 50 ms | 203 ms ❌ | 1,611 ms ❌ |
| Open a note | ≤ 50 ms | 1,553 ms ❌ | 124,909 ms ❌ |
| Open the 1 MB note | - | 5,538 ms | 109,506 ms |
| Typing p95, 1 MB note | ≤ 16 ms | 1,643 ms ❌ | 47,219 ms ❌ |
| Typing p50, 1 MB note | - | 905 ms | 41,634 ms |
| JS heap | - | 16.3 MB | 77.6 MB |
| DOM nodes | - | 22,330 | 189,121 |
| Library content | - | 2.2 MB | 13.8 MB |

Each result file records where it was measured (`environment`). Playwright's desktop Chrome profile reports a Windows user agent on every OS, so the user agent is not a reliable indicator.

**100,000 notes was not measured in the baseline.** "Open a note" grew with the square of the library size (cause 1 below), so one measurement would have taken hours. With causes 1 and 2 fixed it is part of the default run; see [Progress](#progress).

## Causes, by impact

1. **Fixed: the editor's link list was quadratic (dominant).** The "Choose a note to link" dropdown in `NoteEditor` renders an option for every other note. Each label comes from `getNoteLinkLabel`, which scans every note (lower-casing each title) to detect duplicate titles. That is n² work: about 100 million comparisons at 10,000 notes. It runs on **every editor render**, both when a note opens and on **every keystroke**, which is why typing and opening a note scale the same way. The knowledge graph's note picker uses the same function.
2. **Fixed: every note card was rendered at once.** The note grid renders all matching notes: 189,121 DOM nodes at 10,000 notes. That drives cold start and search. It also makes opening a note slow: with the cards memoized, React no longer re-renders them, yet showing the editor over a page that large still costs seconds in browser style and layout work. Opening a note took 10.4 s with 10,000 cards in the grid and 1.5 s with search narrowing it to 100 (development PC).
3. **Mostly fixed: the Markdown preview re-parsed the whole note on every keystroke.** For the 1 MB note this costs seconds per keystroke on its own; cause 1 currently hides it.
4. **Search scans every note's full text on each keystroke**, synchronously, then re-renders the matching cards (cause 2).
5. **Measured as minor: each editor render serialises the whole draft** (`JSON.stringify` of the title, content, and tags) to detect changes, which is expensive for large notes.
6. **Fixed: the sidebar counted notes per item on every render.** Found after cause 1 was fixed. Each shelf count filtered every note and checked every notebook per note, and each notebook and library count filtered every note: about 80 million operations at 100,000 notes. It ran whenever `App` re-rendered, which includes opening a note and every keystroke in search.

## Recommended fixes

In order of payoff:

| Fix | Addresses | Size |
|---|---|---|
| **Done:** compute link labels once per library change, in a single pass, and memoize them; memoize the picker's options and the note cards | Cause 1 | Small |
| **Done:** render the link picker as a searchable list rather than an option per note | Cause 1 (remaining one option per note) | Small |
| **Done:** count notes per notebook, shelf, and library in one memoized pass | Cause 6 | Small |
| **Done:** virtualize the note grid (TanStack Virtual), so only visible cards exist | Causes 2 and 4 | Medium |
| **Done:** memoize the preview, defer it, and preview long notes after a pause in typing | Cause 3 | Small |
| **Done:** replace the text area with CodeMirror 6, which renders only visible lines | Cause 3 (remaining) | Medium |
| Parse long notes' preview off the main thread, so a keystroke during the catch-up parse does not wait | Cause 3 (remaining) | Medium |
| Load CodeMirror only when a note is first opened (it adds about 100 KB gzipped to the bundle) | Start-up | Small |
| Move search to a worker-backed index (MiniSearch now; SQLite FTS5 after the storage migration) | Cause 4 | Medium, overlaps Phase 2 |
| Compare drafts field by field instead of serialising them (profiling shows the whole editor render at about 4 ms per keystroke in the 1 MB note, so this is low priority) | Cause 5 | Small |

With the grid virtualized, the largest remaining wins at 100,000 notes are the link picker's one option per note (opening a note), a search index (search), and keeping fewer full notes in memory (cold start and the 391 MB heap), which the storage migration in the architecture vision addresses.

## Progress

### Link picker fix (cause 1)

`buildNoteLinkLabels` computes every label in one pass (grouping notes by title once), producing exactly the labels the old one-at-a-time function did; a test compares the two on randomized libraries. The editor and knowledge graph memoize the labels per library change, the link picker's options are a memoized component, and note cards are memoized with stable handlers.

Development PC, 10,000 notes, same machine as the baseline:

| Measure | Baseline | After | Change |
|---|---|---|---|
| Open a note | 124,909 ms | 7,501 ms | 17× faster |
| Open the 1 MB note | 109,506 ms | 4,917 ms | 22× faster |
| Typing p95, 1 MB note | 47,219 ms | 1,630 ms | 29× faster |
| Full 10,000-note benchmark run | 20.2 min | 1.2 min | |

GitHub Actions, 10,000 notes (baseline range from two runs of the same code):

| Measure | Baseline | After | Change |
|---|---|---|---|
| Open a note | 24,092–47,031 ms | 2,750 ms | 9–17× faster |
| Open the 1 MB note | 23,136–44,136 ms | 1,975 ms | 12–22× faster |
| Typing p95, 1 MB note | 7,898–14,737 ms | 486 ms | 16–30× faster |

Typing latency no longer depends on library size (on CI, 452 ms at 1,000 notes and 486 ms at 10,000); what remains is re-rendering the 1 MB note's preview on every keystroke (cause 3).

### Virtualized grid (cause 2)

The note grid (`src/features/notes/NoteGrid.tsx`) renders only the rows near the viewport, using TanStack Virtual with the window as the scroll container. Rows follow the grid's breakpoints (1, 2, or 3 columns) and are measured once rendered, so cards keep their natural heights and the layout looks the same. The grid is an ARIA `feed`, and each card carries `aria-posinset` and `aria-setsize`, so screen readers still report "item 5 of 10,000". One trade-off: the browser's own find (Ctrl+F) only sees rendered cards; the app's search covers every note.

Development PC, same machine as the earlier runs:

| Measure | 10,000 notes before | 10,000 notes after | Change | 100,000 notes |
|---|---|---|---|---|
| Cold start | 11,656 ms | 1,178 ms | 10× faster | 10,856 ms |
| Search | 1,296 ms | 249 ms | 5× faster | 2,152 ms |
| Open a note | 7,501 ms | 1,519 ms | 5× faster | 15,426 ms |
| Open the 1 MB note | 4,917 ms | 3,641 ms | | 12,214 ms |
| Typing p95, 1 MB note | 1,630 ms | 821 ms | | 989 ms |
| JS heap | 77.6 MB | 68.9 MB | | 391 MB |
| DOM nodes | 189,121 | 4,100 | 46× fewer | 4,099 |

GitHub Actions (the 10,000-note "before" range comes from the earlier CI runs):

| Measure | 10,000 notes before | 10,000 notes after | 100,000 notes |
|---|---|---|---|
| Cold start | 3,450–5,250 ms | 724 ms ✅ | 8,305 ms |
| Search | 506–634 ms | 162 ms | 2,019 ms |
| Open a note | 2,750 ms | 835 ms | 8,519 ms |
| Typing p95, 1 MB note | 486 ms | 458 ms | 471 ms |
| JS heap | 77.6 MB | 68.9 MB | 368 MB |

Cold start at 10,000 notes now meets its target. The page now holds about 4,100 elements at any library size (4,092 at 1,000 notes). At 100,000 notes, opening a note is dominated by the link picker's 100,000 options, and cold start and memory by keeping every note's full text in memory.

### Searchable link picker and single-pass counts (causes 1 and 6)

The link picker (`src/features/notes/NoteLinkPicker.tsx`) is an ARIA 1.2 combobox. It renders nothing until used and at most 50 matches, instead of one `<option>` per note on every open. The editor reuses `App`'s memoized link labels instead of rebuilding them each time a note opens, and the picker prepares its search text only once it is in use.

Measuring showed those changes alone did not move "open a note" at 100,000 notes (2,380 ms before, 2,386 ms after). The real cost was cause 6: the sidebar recounting notes for every library, shelf, and notebook on each render. `useNoteCounts` (`src/features/library/noteCounts.ts`) now computes every count in one memoized pass, shared by the sidebar and library home.

Development PC, same machine as the earlier runs:

| Measure | 100,000 before | 100,000 after | Change | 10,000 after |
|---|---|---|---|---|
| Open a note | 15,426 ms | 358 ms | 43× faster | 323 ms |
| Search | 2,152 ms | 394 ms | 5.5× faster | 160 ms |
| Cold start | 10,856 ms | 7,417 ms | 1.5× faster | 1,011 ms |
| Open the 1 MB note | 12,214 ms | 3,226 ms | 3.8× faster | 3,197 ms |
| Typing p95, 1 MB note | 989 ms | 967 ms | | 849 ms |

GitHub Actions (the "before" column is the virtualized-grid run):

| Measure | 100,000 before | 100,000 after | Change | 10,000 after |
|---|---|---|---|---|
| Open a note | 8,519 ms | 184 ms | 46× faster | 150 ms |
| Search | 2,019 ms | 241 ms | 8× faster | 107 ms |
| Cold start | 8,305 ms | 4,674 ms | 1.8× faster | 604 ms ✅ |
| Open the 1 MB note | 7,554 ms | 1,766 ms | 4.3× faster | 1,606 ms |
| Typing p95, 1 MB note | 471 ms | 451 ms | | 443 ms |

Opening a note now costs about the same at 10,000 and 100,000 notes. What remains at 100,000 notes is cold start (loading and sorting every note, and keeping all their text in memory), search scanning every note's text, and the 1 MB note's preview re-rendering on each keystroke (cause 3).

### Typing in long notes (cause 3)

A CPU profile of typing 10 characters in the 1 MB note (unminified production build, Chromium) attributed 8,663 ms of 11,248 ms sampled, 77%, to Markdown parsing (`fromMarkdown`); the editor component itself took 48 ms and checklist progress 16 ms. Every keystroke re-parsed the whole note, and so did edits to the title or tags.

- `MarkdownPreview` is memoized, so it re-renders only when its Markdown changes.
- `usePreviewSource` defers the preview, and for notes over 50,000 characters (about 25 ms of parsing) updates it only after typing pauses for 400 ms. The editor shows that the preview is catching up and makes its checkboxes read-only meanwhile, since line numbers may have shifted.
- Checklist progress is computed from the same previewed text, once per change.

Development PC, same machine as the earlier runs:

| Measure | Before | After | Change |
|---|---|---|---|
| Typing p95, 1 MB note, 10,000 notes | 849 ms | 53 ms | 16× faster |
| Typing p95, 1 MB note, 100,000 notes | 967 ms | 64 ms | 15× faster |
| Typing p50, 1 MB note, 100,000 notes | about 850 ms | 46 ms | |
| Open the 1 MB note, 10,000 notes | 3,197 ms | 1,458 ms | 2.2× faster |

GitHub Actions (the "before" column is the link-picker run):

| Measure | Before | After | Change |
|---|---|---|---|
| Typing p95, 1 MB note, 10,000 notes | 443 ms | 37 ms | 12× faster |
| Typing p95, 1 MB note, 100,000 notes | 451 ms | 27 ms | 17× faster |
| Typing p50, 1 MB note, 100,000 notes | about 430 ms | 25 ms | |
| Open the 1 MB note, 100,000 notes | 1,766 ms | 881 ms | 2× faster |

A second profile shows what remains. The editor's own render is about 4 ms per keystroke; most of the rest is the browser laying out a plain text area that holds 1 MB of text, which only an editor that renders visible lines (CodeMirror 6, Phase 1) removes. The one full parse now happens after a pause, so a keystroke typed while it runs still waits for it: the benchmark's occasional maximum of about 0.8 s on the development PC (about 0.4 s on CI). Parsing off the main thread would remove that wait.

### CodeMirror editor (cause 3, remaining)

Before replacing the text area, a probe measured typing in a bare `<textarea>` holding the same 1 MB of text, with no React or app code, the same way the benchmark does: p50 84 ms and p95 109 ms on the development PC. No change to the app could reach the 16 ms target with a text area, because the browser lays out all of its text on every keystroke.

The Markdown source editor (`src/features/notes/MarkdownEditor.tsx`) is now CodeMirror 6 with line wrapping, undo history, and the default keymap. It scrolls inside a fixed height, which is what lets it render only the lines in view. Changes made outside the editor (ticking a checklist item, restoring a revision) are applied as the smallest single edit, so the cursor stays where it was. Markdown syntax highlighting was left out: it pulls in HTML, CSS, and JavaScript parsers and more than doubled the bundle.

| Measure | Text area | CodeMirror | Change |
|---|---|---|---|
| Typing p95, 1 MB note, development PC | 53 ms | 16.1 ms | 3.3× faster |
| Typing p50, 1 MB note, development PC | 34 ms | 13.3 ms | |
| Production bundle | 435 KB (130 KB gzipped) | 741 KB (231 KB gzipped) | +101 KB gzipped |

The development PC runs 2–3× slower than GitHub Actions; see the CI numbers below.
