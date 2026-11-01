# My Notes - Performance Baseline

**Date:** 2026-11-01
**Status:** Baseline, before any performance work. Targets come from [the architecture vision](ARCHITECTURE_VISION.md), section 3E.

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

**100,000 notes is not measured yet.** "Open a note" grows with the square of the library size (cause 1 below). At 100,000 notes a single measurement would take hours, so the default sizes are 1,000 and 10,000 until cause 1 is fixed.

## Causes, by impact

1. **The editor's link list is quadratic (dominant).** The "Choose a note to link" dropdown in `NoteEditor` renders an option for every other note. Each label comes from `getNoteLinkLabel`, which scans every note (lower-casing each title) to detect duplicate titles. That is n² work: about 100 million comparisons at 10,000 notes. It runs on **every editor render**, both when a note opens and on **every keystroke**, which is why typing and opening a note scale the same way. The knowledge graph's note picker uses the same function.
2. **Every note card is rendered at once.** The note grid renders all matching notes: 189,121 DOM nodes at 10,000 notes. That drives cold start and search, and any re-render of the grid.
3. **The Markdown preview re-parses the whole note on every keystroke.** For the 1 MB note this costs seconds per keystroke on its own; cause 1 currently hides it.
4. **Search scans every note's full text on each keystroke**, synchronously, then re-renders the matching cards (cause 2).
5. **Each editor render serialises the whole draft** (`JSON.stringify` of the title, content, and tags) to detect changes, which is expensive for large notes.

## Recommended fixes

In order of payoff:

| Fix | Addresses | Size |
|---|---|---|
| Compute link labels once per library change, in a single pass (title counts in a `Map`), and memoize them; render the link picker as a searchable list rather than an option per note | Cause 1 | Small |
| Virtualize the note grid (TanStack Virtual), so only visible cards exist | Causes 2 and 4 | Medium |
| Defer the preview with `useDeferredValue` and parse it in chunks or a worker for large notes | Cause 3 | Medium |
| Move search to a worker-backed index (MiniSearch now; SQLite FTS5 after the storage migration) | Cause 4 | Medium, overlaps Phase 2 |
| Compare drafts field by field instead of serialising them | Cause 5 | Small |

Cause 1 alone should turn "open a note" at 10,000 notes from about 24 seconds on CI (two minutes on the development PC) into well under a second, and it makes 100,000-note runs possible.
