# The Personal Knowledge Library - Performance Baseline

*Written when the app was called My Notes; it is now The Personal Knowledge Library (1.2.0). The record below is kept as it was, apart from status updates.*

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
   - **Typing work (the target):** the main-thread time each keystroke causes (scripts, style, layout, paint), from a Chromium performance trace, typing 60 characters in the 1 MB note; p50, p95, and max are reported. Idle time waiting for the next display frame is not counted (`bench/typingLatency.ts`).
   - **Typing to next frame:** the time from each keydown until the frame after it renders. It includes waiting for the display's next frame, so it cannot read much below 16 ms wherever frames follow the display's refresh; it is reported for comparison only. Results before November 2, 2026 used this measure with 24 characters (the "Typing p95" rows below).
   - **Bare input:** both measures on a page holding only an `<input>`, in the same run, showing what the browser costs by itself.
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
| **Done:** parse long notes' preview off the main thread, so a keystroke during the catch-up parse does not wait | Cause 3 (remaining) | Medium |
| **Done:** load the editor (CodeMirror and the Markdown preview) in its own chunk after start-up | Start-up | Small |
| **Done:** search lower-cases each note once (cached until it is saved), stops re-sorting the library on every keystroke, and looks up locations in a map | Cause 4 (part) | Small |
| **Done:** search libraries of 5,000+ notes in a worker, and build results from the matches rather than walking every note | Cause 4 (remaining) | Medium |
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

### Typing reaches the 16 ms target (November 2, 2026)

Profiling typing on the CodeMirror editor showed two more fixes:

- **The whole draft was serialised on every render.** `NoteEditor` passed autosave `JSON.stringify` of the title, the 1 MB content, and the tags, only to detect changes: about 6.5 ms per keystroke on the development PC. It now passes a memoized draft object compared by identity; `NoteEditor` dropped to about 1 ms per keystroke.
- **The first keystroke after a pause re-parsed the whole note.** Making checkboxes read-only while the preview catches up changed a prop on the memoized preview, so the 1 MB note was re-parsed (0.4–0.7 s, the maximum in every earlier run). The parsed tree now depends on the Markdown text alone; interactivity travels through context.

**Why the typing measure changed.** On GitHub Actions, with 80 keystrokes per page:

| Page | To next frame p50 | To next frame p95 |
|---|---|---|
| A bare `<input>`, nothing else | 0.9 ms | 16.6 ms |
| A bare `contenteditable` div | 0.8 ms | 15.4 ms |
| The app, small note | 6.2 ms | 20.7 ms |
| The app, 1 MB note | 9.1 ms | 19.0 ms |

A page with no app code read 16.6 ms p95, because the measure waits for the display's next frame. No page could meet a 16 ms target that way, so the target now applies to main-thread work per keystroke, with the old measure still reported. The same runs showed that typing no longer depends on note size.

GitHub Actions, 10,000 notes, three runs of the same code:

| Measure | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Typing work p95, 1 MB note | 10.2 ms ✅ | 9.9 ms ✅ | 12.1 ms ✅ |
| Typing work p50, 1 MB note | 6.5 ms | 7.6 ms | 7.8 ms |
| Typing work max, 1 MB note | 16.2 ms | 16.1 ms | 16.6 ms |
| Typing to next frame p95 | 20.3 ms | 20.5 ms | 20.2 ms |
| Bare input: work p95 | 1.6 ms | 2.5 ms | 3.0 ms |
| Bare input: to next frame p95 | 16.2 ms | 16.9 ms | 16.5 ms |

On the development PC, the same build measured 20.9 ms work p95 (bare input 3.4 ms); that machine runs 2–3× slower than CI. A trace breakdown there put most of each keystroke in event handling and scripts (CodeMirror and React), with style and layout under 1 ms and paint and compositing about 2–4 ms.

### The editor loads after start-up (November 2, 2026)

The note editor (`NoteEditor`, with CodeMirror and the Markdown preview) is now its own chunk. `App` starts fetching it right after the first render (`src/features/notes/noteEditorChunk.ts`), so by the time a note is opened its code is usually in memory. `LazyNoteEditor` renders the editor in the same pass once the code has loaded; until then it renders nothing, and if loading fails (for example offline before the service worker has cached the chunk) it shows an error and tries again on the next open.

`React.lazy` was tried first and made opening the first note about 100 ms slower on the development PC (about 415 ms instead of about 300 ms, at 1,000 notes), even with the chunk already loaded. `lazy()` suspends on its first render regardless, and React then holds back the revealed content for its Suspense throttle.

| Measure | One bundle | Editor split out |
|---|---|---|
| JavaScript before the note list can render | 746 KB (233 KB gzipped) | 284 KB (86 KB gzipped) |
| Editor chunk, fetched after start-up | — | 463 KB (148 KB gzipped) |
| Open note, 1,000 notes, development PC | 266–341 ms | 261–288 ms |
| Cold start, 1,000 notes, development PC | 317–362 ms | 290–312 ms |

GitHub Actions, earlier runs on the single bundle (two runs) against one run with the editor split out:

| Measure | One bundle | Editor split out |
|---|---|---|
| Cold start, 1,000 notes | 185–188 ms | 106 ms |
| Cold start, 10,000 notes | 607–656 ms | 403 ms |
| Open note, 1,000 notes | 148–151 ms | 92 ms |
| Open note, 10,000 notes | 160–161 ms | 110 ms |
| Typing work p95, 1 MB note | 8.8–10.9 ms | 6.3–6.4 ms |

CI runners vary from run to run, so treat single-run differences with care. Start-up gained the most, as expected, because less JavaScript is parsed before the note list renders.

The service worker precaches both chunks, so the app still works fully offline after the first visit.

### Search operators and cheaper matching (November 2, 2026)

Search now parses operators (`src/lib/search.ts`) and matches every word rather than the whole query as one string. Three costs came out of each keystroke:

- **Lower-casing every note's full text.** Each note's searchable text is lower-cased once, the first time it is searched, and cached until the note is saved (its `updatedAt` changes). Notes deleted for good are dropped from the cache. The cache holds a lower-cased copy of each searched note, so memory grows by roughly the size of the library's text once search has been used.
- **Sorting the whole library.** Sorting now depends only on the notes, not the query.
- **Finding each note's notebook, shelf, and library** with array scans per note. They are now looked up in a map built once per library change.

A Node micro-benchmark over 10,000 notes plus a 1 MB note put matching at 11.9 ms when lower-casing on every search, 2.9 ms from the cache, and 33.5 ms with case-insensitive regular expressions (rejected). Building the cache costs about 30 ms, paid on the first search.

The benchmark's "Search" row cannot show the difference: it times Playwright filling the field and then polling, about 100 ms of round trips even at 1,000 notes. A one-off in-page probe measured main-thread time per keystroke typing a 9-letter search at 10,000 notes on the development PC:

| Per keystroke | Before | After |
|---|---|---|
| First search (builds the cache) | 72 ms | 64 ms |
| Later searches, median | 30 ms | 16 ms |
| Later searches, slowest key | 40 ms | 26 ms |

`useDeferredValue` on the query was tried and removed: it made the benchmark's search about 100 ms slower, because React renders deferred work at low priority in small slices.

### Live preview (November 3, 2026)

Live preview (`src/features/notes/livePreview.ts`) parses Markdown with `@lezer/markdown` directly. `@codemirror/lang-markdown` was avoided because it also bundles the HTML, CSS, and JavaScript parsers. Decorations are built only for the visible lines, so their cost does not grow with the note. Source mode adds no parser at all.

The development PC first suggested a slowdown (typing p95 20–22 ms, against 13–16 ms before), but that machine is noisy. One GitHub Actions benchmark run each of `main` and the branch, run at the same time, showed no difference:

| Measure (1,000 / 10,000 notes) | `main` | Live preview |
|---|---|---|
| Typing work p95, 1 MB note | 8.3 / 7.7 ms | 7.6 / 8.6 ms |
| Open note | 154 / 160 ms | 141 / 177 ms |
| Open the 1 MB note | 657 / 677 ms | 667 / 645 ms |

The parser adds about 14 KB gzipped to the editor chunk (161 to 174 KB), which loads after start-up; start-up JavaScript is unchanged (91 KB gzipped).

### Long-note preview off the main thread (November 3, 2026)

Notes over 50,000 characters already previewed only after a 400 ms pause in typing, but the catch-up then parsed and rendered the whole note in one blocking step. Measured in Chromium on the development PC, for 1 MB notes:

| Step | Plain prose | Dense Markdown (lists, tasks, links) |
|---|---|---|
| Parse | 1.9–2.0 s | 11.7–12.3 s |
| Copy the parsed tree to or from a worker | 34–38 ms | 0.8 s |
| Render to the page | 0.14–0.22 s | 14–15 s |

Three changes:

- **Parsing moved to a Web Worker** (`markdownPreview.worker.ts`). Short and long notes share one function, `markdownToHast`. It applies the same safety rules react-markdown did: raw HTML becomes text, and URLs go through `defaultUrlTransform`. A newer parse abandons one still running.
- **The result is rendered as a React transition.** `content-visibility: auto` on the preview's blocks was tried and removed: with thousands of paragraphs it added 5–8 ms to every keystroke on CI (typing p95 at 10,000 / 100,000 notes was 16.1 / 20.1 ms with it, 10.9 / 12.7 ms without), and it saved almost nothing when a dense preview appeared (longest task 0.69 s with it, 0.73 s without).
- **Checkbox labels no longer split the whole note per checkbox.** When typing resumed, the checkboxes turned read-only, and each re-rendered checkbox split the 1 MB note to find its label. That was about 9,000 splits for the dense note, the biggest freeze of all. The note is now split once per version.

Vite resolves packages with the "browser" condition even inside workers. That picked a DOM-only build of `decode-named-character-reference` and crashed the worker, so `vite.config.ts` points the worker build at the package's worker version.

Longest main-thread task after a pause in typing, from `PerformanceObserver('longtask')` (development PC):

| 1 MB note | Before | After |
|---|---|---|
| Plain prose: longest task (total blocking) | 0.70 s (0.65 s) | none |
| Dense Markdown: longest task (total blocking) | 28.5 s (47.8 s) | 0.73 s (1.07 s) |

GitHub Actions, `main` and this change benchmarked at the same time:

| Measure | `main` | Preview in a worker |
|---|---|---|
| Typing work p95, 1 MB note, 10,000 notes | 12.5 ms | 8.7 / 10.4 ms |
| Typing work p95, 1 MB note, 100,000 notes | 11.4 ms | 13.5 / 11.5 ms |
| Open the 1 MB note, 10,000 notes | 757 ms | 121 / 132 ms |
| Open the 1 MB note, 100,000 notes | 1,105 ms | 379 / 376 ms |

Typing is unchanged within run-to-run variation. Opening a huge note is several times faster, because the editor no longer waits for its preview; the benchmark now waits for the preview to render before measuring typing, so the two do not overlap.

The remaining 0.73 s for dense notes is mostly turning the parsed tree into React elements, which happens in one step. The worker file is 173 KB (not gzipped), loads only when a long note is opened, and is precached for offline use.

### Search in a worker for large libraries (November 4, 2026)

At 100,000 notes, each keystroke in the search box blocked the main thread for 80–175 ms (median, development PC), and the first search took over 0.6 s. A CPU profile showed that matching was not the main cost. Most of the time went to filtering every note for the list on each keystroke.

Libraries of 5,000 notes or more (`WORKER_SEARCH_THRESHOLD`) now search in a Web Worker (`search.worker.ts`, `useSearchMatches.ts`) that runs the same `lib/search.ts` matching:

- **Copying the library.** The worker gets a copy of the library in 2,000-note steps scheduled with `requestIdleCallback`; Safari, which lacks it, uses short timeouts. The copy starts when the search box gets focus, or in idle time after a large library loads. Afterwards the worker receives only notes that changed. Once it has a note, it prepares the note's lower-cased text in idle time.
- **Before the copy is complete,** search runs on the page exactly as before, so the first results never wait for the worker.
- **Once the worker is ready,** it answers every search. The list keeps its previous results while the count reads "Searching…", and is then built from the matches rather than by walking every note.

Two earlier versions made the benchmark's first search slower. Each was measured on GitHub Actions against `main` and changed:

- **Waiting for the copy before searching:** first search 183 / 924 ms at 10,000 / 100,000 notes, against `main`'s 75 / 301 ms.
- **Copying with `setTimeout` steps that competed with that search:** 399 and 525 ms at 100,000, against 312 and 316 ms.

The final version, on GitHub Actions with `main` measured at the same time:

| Measure | `main` | Worker |
|---|---|---|
| Search, 10,000 / 100,000 notes | 75 / 319 ms | 80 / 306 ms |
| Cold start, 10,000 / 100,000 notes | 567 / 4,972 ms | 560 / 4,699 ms |
| Typing work p95, 1 MB note, 10,000 / 100,000 notes | 9.5 / 14.8 ms | 7.9 / 14.0 ms |

Main-thread time per keystroke typing a search at 100,000 notes, measured in the page on the development PC, after the page has settled:

| Per keystroke | `main` | Worker |
|---|---|---|
| Median | 81–175 ms | 7–35 ms |
| Slowest keystroke | 105–671 ms | 46 ms |

Typing a search straight after loading behaves as on `main` until the worker has its copy.

### Whole-library graph (November 4, 2026)

The Knowledge Graph's **Whole library** view draws every note with sigma.js (WebGL) and lays the
graph out with ForceAtlas2 in a worker. The view and its libraries are a separate download of
169 KB (plus a 79 KB layout worker), fetched only when the view is first opened.

Measured locally in headless Chromium (seeded libraries with 1.5 links per note), with the
milliseconds of main-thread long tasks:

| | 20,000 notes | 100,000 notes |
|---|---|---|
| Graph shown after opening the view | 2.7 s | 10.7 s |
| Layout settled | 17 s | 34 s |
| Slowest search keystroke with the graph shown | 383 ms | 1,163 ms |

What was tried and changed:

- **sigma 4 replaced by sigma 3.** sigma 4 (released October 2026) evaluates a style engine for
  every note and link on each redraw, through compiled object-spread helpers. At 20,000 notes
  each redraw took 1.5–3.5 s of script, and search keystrokes up to 4.6 s. sigma 3 copies each
  item's attributes once and hands that copy to the reducer. With it, search keystrokes take
  at most 383 ms, and the download is 169 KB instead of 456 KB.
- **Reducers change only what differs** (and, on sigma 4, returned shared objects); copying
  each item's whole look was most of the cost.
- **Partial redraws:** pointing at a note redraws only it, its neighbours, and their links,
  rather than dimming the whole graph. A search keystroke redraws only the notes whose match
  changed; a full redraw happens only when more than a quarter of the notes change.
- **Fewer layout updates for large graphs:** positions are posted every 120 ms up to 5,000
  notes, every second up to 20,000, and every 4 seconds above that. Every update redraws the
  whole graph.
- **Links are hidden while panning or zooming** when there are more than 5,000 of them.

Most of the remaining long tasks are WebGL drawing. Headless Chromium here draws WebGL in
software (SwiftShader), so these numbers overstate the cost on a machine with a graphics card;
WebKit on the same machine reports the Intel GPU. The views outside the graph are unchanged:
it is a separate chunk and runs only while the graph is shown.

### Size budgets and Lighthouse in CI (November 5, 2026)

Every pull request now also fails if the app grows past its budgets, or if
Lighthouse scores drop:

| Check | Budget | Now |
|---|---|---|
| Install download (everything precached) | 1,500 KiB | 1,307 KiB, 18 files |
| Start-up script, gzipped | 125 KiB | 105 KiB |
| Start-up styles, gzipped | 15 KiB | 9 KiB |
| Lighthouse performance (mobile throttling) | 90 | 100 |
| Lighthouse accessibility | 95 | 100 |
| Lighthouse best practices | 90 | 100 |

`npm run size` (scripts/checkSizes.mjs) measures the files the service worker
precaches and the gzipped start-up script and styles; chunks loaded on demand
(maths, diagrams, the graph, imports) are not limited, since nobody downloads
them until they are used. Lighthouse runs three times on the built app with
its mobile preset (`lighthouserc.json`, `@lhci/cli` 0.16), and the median run
is checked; reports are kept as a CI artifact. Raise a budget only on purpose,
with the reason in the pull request.

