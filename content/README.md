# Built-in handbooks

The handbooks in this folder ship with the app. They are curated, read-only, and readable offline
from the first launch. A reader can make a personal copy of a handbook note or write a note about
it, but never edits it in place. See [docs/KNOWLEDGE_LIBRARY_PLAN.md](../docs/KNOWLEDGE_LIBRARY_PLAN.md).

The build reads this folder (`scripts/coreContent.ts`), checks it, and compiles one file per
library. **Any mistake stops the build**, and the message names the file and the problem.

## Layout

Four levels, as in the app: Library → Shelf → Notebook → Note.

```text
content/
└── health-and-wellbeing/          a library
    ├── library.md
    └── nutrition/                 a shelf
        ├── shelf.md
        └── everyday-nutrition/    a notebook
            ├── notebook.md
            ├── 01-staying-hydrated.md
            └── 02-water-through-the-day.md
```

Folder names are only for people; the app uses each item's `id`.

## Headers

Every file starts with a header between `---` lines: one `key: value` per line. Text after the
header is the item's body, written like any note (headings, lists, `[[Note title]]` links).

`library.md`, `shelf.md`, and `notebook.md`:

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | Unique, starts with `core-`, lower-case letters, digits, and hyphens. Never change it once released: personal notes link to it. |
| `name` | yes | The name shown in the app. |
| `description` | yes | One sentence about what belongs here. |
| `order` | yes | A whole number; lower comes first. |

A note (any other `.md` file in a notebook folder):

| Key | Required | Meaning |
|---|---|---|
| `id` | yes | As above. |
| `title` | yes | Unique among handbook notes, so `[[Title]]` links are clear. |
| `summary` | yes | One sentence shown under the title and on cards. |
| `type` | yes | `Article`, `Guide`, `Chapter`, or `Handbook`. |
| `order` | yes | Position in the notebook. |
| `added` | yes | The date it was added, `YYYY-MM-DD`. |
| `draft` | no | `true` while the text is not final; the app labels it **Draft**. |
| `reviewed` | no | Who reviewed it and when, for example `Dr A. Reviewer, 2026-11-20`. Health and money notes need one before release. |

## Sources

End every note with a `## Sources` section listing, as links, the public sources it was written from, preferring official ones (government departments, the WHO, regulators). Reviewers check the text against them. Do not quote amounts that change every year, such as grant amounts; point to where the current figure is published.

## Pictures

Every note has at least one picture; the build stops when one is missing. Put the file next to the note, with the same name (`01-staying-hydrated.svg` beside `01-staying-hydrated.md`), and show it after the first paragraph:

```markdown
![A woman drinking a glass of water on a sunny day.](01-staying-hydrated.svg)
```

- The words in the brackets say what the picture shows, for people who cannot see it. They are required.
- Pictures are files in `content/`, never links to other websites, so they show offline. The build copies each one to `assets/picture-<name>-<hash>.svg`, downloaded with the handbooks.
- Use simple drawings (SVG) of a few kilobytes, without words in them, since the app is translated. `.png`, `.jpg`, and `.webp` also work, but photos are large: the handbooks and their pictures share a 600 KiB budget (`scripts/checkSizes.mjs`).
- The drawings so far are flat illustrations 640 × 360 with rounded corners, a soft background per library, and people of different ages and skin tones. New pictures should match them.

## Links

`[[Title]]` links to another handbook note by its title, and `[[Title#Heading]]` to a section. The
build checks that every link points at a handbook note.
