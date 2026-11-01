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
3. **The Markdown preview re-parses the whole note on every keystroke.** For the 1 MB note this costs seconds per keystroke on its own; cause 1 currently hides it.
4. **Search scans every note's full text on each keystroke**, synchronously, then re-renders the matching cards (cause 2).
5. **Each editor render serialises the whole draft** (`JSON.stringify` of the title, content, and tags) to detect changes, which is expensive for large notes.

## Recommended fixes

In order of payoff:

| Fix | Addresses | Size |
|---|---|---|
| **Done:** compute link labels once per library change, in a single pass, and memoize them; memoize the picker's options and the note cards | Cause 1 | Small |
| Render the link picker as a searchable list rather than an option per note | Cause 1 (remaining 10,000-option list) | Small |
| **Done:** virtualize the note grid (TanStack Virtual), so only visible cards exist | Causes 2 and 4 | Medium |
| Defer the preview with `useDeferredValue` and parse it in chunks or a worker for large notes | Cause 3 | Medium |
| Move search to a worker-backed index (MiniSearch now; SQLite FTS5 after the storage migration) | Cause 4 | Medium, overlaps Phase 2 |
| Compare drafts field by field instead of serialising them | Cause 5 | Small |

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
