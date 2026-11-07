# Translating The Personal Knowledge Library

The Personal Knowledge Library is available in **English**, **Spanish** (Español), and **Arabic**
(العربية, right to left). Choose a language in **Settings → Appearance →
Language**, or keep **Same as this device** to follow the device's language
(English when it is not one of these). The choice is kept on the device.

The handbooks themselves are in English for now (see
[content/README.md](../content/README.md)); the app around them is translated.

The Spanish and Arabic texts were written with machine assistance and have not
yet been reviewed by native speakers. Corrections are very welcome.

## How it works

- Text is written in English in the code, wrapped in `t()`:
  `t('Create a new note')`. The English text is the key, so English needs no
  catalog.
- Values go in braces: `t('Saved “{title}” to {notebook}.', { title, notebook })`.
  Translations may move them, but must keep the same names.
- Text that depends on a count uses `tp()`, with the English singular and
  plural: `tp(count, '{count} note', '{count} notes')`. Each language gives one
  form per plural category: Spanish has `one`, `many`, and `other`, and Arabic
  has `zero`, `one`, `two`, `few`, `many`, and `other`. Arabic forms may spell
  out one and two instead of using `{count}`.
- Text kept in a constant (tips, commands, import sources) is marked with
  `msg('…')` and translated where it is shown, with `t()`.
- Each language's catalog is `src/i18n/<code>.ts`, loaded only when that
  language is used. Notes themselves are never translated: they are your own
  words, and the starter notes and notebooks are created in English.

## Right-to-left

In Arabic, the page's direction is right to left. Layouts use start and end
rather than left and right (Tailwind's `ms-`, `ps-`, and `start-` classes, and
CSS logical properties), so the sidebar, menus, and panels mirror. Notes follow
their own text in any language: each paragraph, heading, list item, and table
cell takes the direction of its first letters, so an Arabic paragraph reads
right to left in the English app, and an English one left to right in the
Arabic app.

## Checks

- `src/i18n/i18n.test.ts` finds every text passed to `t()`, `tp()`, and `msg()`
  in the source. It fails if a catalog is missing one, has a placeholder the
  English does not, lacks a plural form its language needs, or keeps a text the
  app no longer uses.
- `e2e/translations.spec.ts` opens the main screens in Spanish and fails if any
  of the catalogs' English texts is shown.
- `e2e/languages.spec.ts` covers choosing a language, the switch to right to
  left (including the accessibility checks in Arabic), and notes keeping their
  own direction.

## Adding a language

1. Add it to `LANGUAGES` and the loaders in `src/i18n/i18n.ts`, with its name in
   its own language and its direction.
2. Copy `src/i18n/es.ts` to `src/i18n/<code>.ts` and translate each value,
   keeping `{placeholders}` and giving every plural category the language has
   (`new Intl.PluralRules('<code>').resolvedOptions().pluralCategories`).
3. Run `npm test`: the catalog test lists anything missing.
