# Acceptance

Phase 10 of [KNOWLEDGE_LIBRARY_PLAN.md](KNOWLEDGE_LIBRARY_PLAN.md): the design specification's
handoff acceptance checklist ([section 11](design/peoples-home-spec.md#11-developer-handoff-guidance)),
item by item, with the evidence for each. It also covers the checks that need people:
screen readers, a usability session with readers, and a review of the handbooks by
qualified people.

Last checked: 7 November 2026, version 1.2.0.

## The checklist

**Automated** means a test checks it on every change, in Chromium, Firefox, and WebKit unless noted.
**Needs people** means the automated checks pass, but sign-off needs the sessions below.

| # | Item | Evidence | Status |
|---|---|---|---|
| 1 | A new user understands the Library → Shelf → Notebook → Note hierarchy. | Every page shows where it sits: the breadcrumb, a counted list of what it holds ("2 shelves · 7 notebooks"), and the reader's "Handbook · Library / Shelf / Notebook" line (`library-pages.spec`, `navigation.spec`, `handbooks.spec`). | Automated; **needs people** (usability session, tasks 1–2) |
| 2 | Home answers location, exploration, resume, and new-content questions without KPI dashboard styling. | Home has Continue reading (the note and where it sits), Explore libraries, Recently added, and the offline state. The only figures are plain counts on the library tiles ("3 shelves"): no scores, streaks, progress charts, or activity feeds (`home.spec`). | Automated |
| 3 | Library, Shelf, Notebook, and Note each have the specified content order and hierarchy cues. | Heading, description, and counts, then contents in order, then related places. A notebook's numbered contents mark the last-read note. Personal libraries keep **Manage** at the end (`library-pages.spec`, `handbooks.spec`). | Automated |
| 4 | Reading remains comfortable at phone, tablet, desktop, and 200% zoom. | Measured line length (56, 66, or 78 characters), reading settings, and no sideways scrolling at 200% zoom or on a phone (`reading-room.spec`) or a tablet (`acceptance.spec`). Pictures keep their space before they load, so the text never jumps. | Automated |
| 5 | Sidebar supports expanded, collapsed, tablet overlay, and mobile drawer states. | Expanded, or collapsed to a rail of named icons, from 1200 px; a drawer over the page below that, on tablets and phones (`navigation.spec`, `accessibility.spec`, `acceptance.spec`, `App.test`). | Automated |
| 6 | Search results show item type and parent context; the no-result state offers a recovery route. | Each result says Library, Shelf, Notebook, or Note (and "Handbook") and where it sits. With no results, it suggests fewer or different words, and offers **Clear search** and **Browse the libraries** (`search-page.spec`). | Automated |
| 7 | Related content and graph have readable, keyboard-accessible list alternatives. | **Mentioned in** and **Related notes** are lists with reasons. The note map has **Skip to the list** and the same notes listed below it (`relationships.spec`, `library-graph.spec`). | Automated |
| 8 | Light and dark themes pass contrast checks for actual text, controls, focus, and disabled states. | Every token pairing in light, soft paper, and dark is checked by `theme.test.ts`. axe checks the real screens in light and dark (`accessibility.spec`). Disabled controls are exempt from the contrast minimum (WCAG 1.4.3); a person should still confirm they read clearly. | Automated; **needs people** (disabled states) |
| 9 | Keyboard-only completion, screen-reader semantics, touch targets, focus return, and reduced-motion behaviour are verified. | A keyboard-only journey from Home to a note, through a link and back, ending with focus where the reader started (`acceptance.spec`, Chromium and Firefox; WebKit tabs only between links by default). axe checks names, roles, and 24 px touch targets (WCAG 2.5.8). Reduced motion and high contrast are covered in `acceptance.spec`. | Automated; **needs people** (screen readers) |
| 10 | Offline messaging reflects verified availability and never promises unimplemented behaviour. | Home says "Available offline" only once the app is saved on the device, and "You are offline" when it is. Handbooks, pictures, and pages open with the network off (`offline.spec`). | Automated |
| 11 | No AI, social network, chat, voice/video call, or dashboard feature has been added. | None exist; the plan's "Not planned" list and [DECISIONS.md](DECISIONS.md) require a decision before any is proposed. | Checked by review |

### Fixed during acceptance

- **Focus return:** after following a link inside an open note, or using Previous, Next, or Back, closing the note sent focus to the **New note** button. Focus now returns to the item that first opened the note.
- **An offline promise made too early:** Home said the handbooks were "ready to read, even offline" before the app had been saved on the device. It now says so only once it has.
- **Reduced motion:** jumping to a section from **Contents** scrolled smoothly even when the system asks for less motion. It now jumps straight there.
- **High contrast:** the current page, the chosen option, focus on menu items, and the reading progress were marked only by backgrounds, which Windows Contrast themes remove. They are now outlined in the system's highlight colour.

## Checks that need people

The app is live at <https://golden-startup-guide.github.io/get-started/>. Nothing needs to be installed: open it in a browser on a phone or a computer.

### 1. Screen readers

Run the [manual checks in ACCESSIBILITY.md](ACCESSIBILITY.md#manual-checks) with:
- NVDA and Firefox, on Windows;
- VoiceOver and Safari, on a Mac or an iPhone;
- one Windows Contrast theme (Settings → Accessibility → Contrast themes).

Record each result below.

| Check | NVDA + Firefox | VoiceOver + Safari | Contrast theme |
|---|---|---|---|
| Manual checks 1–10 | not yet done | not yet done | not yet done |

### 2. A usability session with readers

**Who:** 3 to 5 people who would really use the app, not developers. Include someone who reads mostly on a phone, and someone older or less used to apps.

**How:** one person at a time, about 20 minutes, on their own phone or computer. Give each task in your own words, then watch without helping. When someone gets stuck, note where, and only then help. Ask them to think aloud.

**Tasks:**
1. "Find something about growing vegetables, and start reading."
2. "Where are you now? How would you get back to the start?" (Success: they name the library, shelf, or notebook, or use the breadcrumb or Home.)
3. "Close the app. Open it again and carry on where you stopped." (Success: they use **Continue reading** on Home.)
4. "This page mentions another page. Go there, then come back." (Success: they follow a link or **Related notes**, and use Back or **Previous**.)
5. "Make the text bigger." (Success: they find **Reading settings**.)
6. "Find what the app says about stokvels." (Success: they use **Search**.)
7. For someone comfortable with it: "Do task 4 again with only the keyboard" (Tab, Enter, Escape), or at 200% zoom.

**After the tasks, ask:**
- What was confusing?
- Were the pictures helpful?
- Would you use this? What for?

**Write down** for each task: done or not, roughly how long it took, and what they said. Send the notes, or open an issue at <https://github.com/Golden-Startup-Guide/get-started/issues>.

| Reader | Tasks done (of 6–7) | Main problems |
|---|---|---|
| — | not yet done | |

### 3. Reviewing the handbooks

Every handbook page shows **Draft: not yet reviewed** until a qualified person has checked it. Health and money pages need one before release.

**For reviewers:**
- Read the page in the app. At the end of every page is a **Sources** list. Check the text, and the picture, against them and against your own knowledge.
- Note anything wrong, unclear, unsafe, or out of date, with the page's title. Suggest better wording if you can.
- Check that the page points readers to professional help where they need it. Pages don't quote amounts that change every year; they say where to find the current figure.
- Say whether the page is approved as it stands, or after your changes.

**When a page is approved:** its file in `content/` gets a `reviewed:` line naming the reviewer and the date, for example `reviewed: Dr A. Reviewer, 2026-11-20`. Its `draft: true` line is removed. The **Draft** label then disappears from the app with the next update.

| Library | Reviewer | Pages approved |
|---|---|---|
| Health & Wellbeing | — | 0 of 9 |
| Agriculture | — | 0 of 7 |
| Financial Literacy | — | 0 of 6 |
| Education & Learning | — | 0 of 5 |
| Community Development | — | 0 of 6 |
| Skills & Careers | — | 0 of 6 |
| Home & Family | — | 0 of 5 |
| South Africa | — | 0 of 5 |
