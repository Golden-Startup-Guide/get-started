# Accessibility

The Personal Knowledge Library aims to meet **WCAG 2.2 level AA**: usable with a keyboard alone,
with a screen reader, at 200% zoom and on small screens, and in light and dark
themes.

## What is checked automatically

Every pull request runs `e2e/accessibility.spec.ts` in Chromium, Firefox, and
WebKit. It uses [axe-core](https://github.com/dequelabs/axe-core) with the
WCAG 2.0, 2.1, and 2.2 A and AA rules, and fails on any violation, on:

- the workspace (note grid, sidebar, search), the note editor and preview,
  Settings, the command palette, the quick note box, search tips, both views
  of the knowledge graph, and Trash, in the **light and dark** themes;
- the phone layout and its navigation drawer.

`e2e/acceptance.spec.ts` adds the design specification's acceptance checks
(see [ACCEPTANCE.md](ACCEPTANCE.md)): a keyboard-only journey from Home to a
handbook note and back, with focus returned to where the reader started; a
tablet width with no sideways scrolling; high-contrast mode; and reduced motion.

Automated checks find roughly a third of accessibility problems, so they are
paired with the manual checks below.

Fixed when these checks were added (November 2026): the command palette
button's accessible name did not include the shortcut shown on it (WCAG 2.5.3,
Label in Name). It is now named from its content, "Open command palette Ctrl
K".

## Built in

- **Keyboard:** everything works from the keyboard. Ctrl+K (⌘K) opens the
  command palette from anywhere, Alt+N opens a quick note, arrow keys move
  through the palette, completions, and the theme options, and Escape closes
  dialogs, menus, and panels.
- **Focus:** dialogs keep focus inside them and return it to where it was when
  they close, without taking focus away from a dialog opened meanwhile.
  Choosing a page from the command palette, or from the navigation drawer on a
  phone, moves focus to that page's heading.
- **Screen readers:** landmarks and headings structure every page. Controls
  have names, toggles announce their state (`aria-pressed`, `aria-expanded`),
  and save status, search counts, notices, and errors are live regions. Maths
  is rendered with MathML, so it is read aloud.
- **Visual:** text and controls meet AA contrast in both themes (checked by the
  axe rules above), and focus is always visible. The layout adapts to phone
  widths with a navigation drawer, and animations are reduced when the system
  asks for reduced motion (including the jump to a section from **Contents**).
- **High contrast:** in Windows Contrast themes (forced colours), anything the
  normal themes mark with a background alone (the current page, the chosen
  option, focus on menu items, the reading progress) is outlined in the
  system's highlight colour instead.
- **Pictures:** every handbook picture has a written description, read aloud by
  screen readers in place of the picture.

## Known limitations

- **The whole-library graph** is a WebGL drawing and cannot be explored by
  screen reader or keyboard directly. Its accessible alternatives: search
  narrows it and lists up to 50 notes as buttons that select a note, and
  **Around a note** shows any note's links and backlinks as lists.
- **The web clipper** is installed by dragging it to the bookmarks bar. Keyboard
  users can instead copy its link (from the context menu) into a new bookmark.

## Manual checks

A person should repeat these before each release, with NVDA and Firefox on
Windows and VoiceOver and Safari on macOS and iOS. **They have not yet been
done by a person.** The automated checks above are the evidence so far.

1. Create, edit, tag, and move a note using only the keyboard; confirm focus is
   always visible and nothing traps it.
2. With a screen reader, find a note by search, and hear the result count
   update.
3. Open a note: the title field, editor, live preview, and save status are
   announced. A checklist item can be ticked in the preview.
4. Follow a `[[link]]`, then return using a backlink.
5. From Home, open a handbook library, a shelf, a notebook, and a note; hear
   where you are (the breadcrumb and page heading), the picture's description,
   and **Previous** and **Next**; close the note and land back where you were.
6. Open Settings, export a backup, and import it, hearing each notice.
7. Use the command palette: hear the options and the selected one as the arrow
   keys move.
8. Zoom to 200% and use a 320 px-wide window: nothing is cut off or overlaps.
9. In Windows High Contrast (forced colours) mode, all controls and focus
   indicators are visible.
10. Explore the knowledge graph with **Around a note**, and select a note in
   **Whole library** through search.

Report accessibility problems as issues at
<https://github.com/Golden-Startup-Guide/get-started/issues>.
