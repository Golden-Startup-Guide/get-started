import type { Note } from '../types'

/**
 * One note per starter notebook, created with a brand-new library so no notebook starts empty.
 *
 * The IDs are fixed: importing a backup from another device that also has these notes skips
 * them as duplicates instead of creating copies.
 */
export function starterNotes(now: number): Note[] {
  const note = (id: string, notebookId: string, title: string, content: string, order: number): Note => ({
    id,
    title,
    content,
    notebookId,
    // The welcome note is newest, so it appears first.
    createdAt: now - order,
    updatedAt: now - order,
    tags: [],
    pinned: false,
    favorite: false,
  })

  return [
    note('starter-note-welcome', 'starter-personal', 'Welcome to My Notes', `Your notes stay in this browser. Nothing is sent anywhere, and the app works offline.

## Getting around
- **Libraries, shelves, and notebooks** in the sidebar organize your notes, from broad to specific.
- **Search** looks through titles, text, notebooks, and tags.
- **Favorites** and **pins** keep important notes close.

## Writing
Just type. The buttons above the note make text **bold** or *italic* and add headings, lists, and checklists. You can also type / at the start of a line to pick one.

- [ ] Tick this box to try a checklist
- [ ] Add a tag to this note
- [ ] Link to another note with the **Link to a note** button, like [[Weekly plan]]

## Keeping your notes safe
Export a backup from **Settings** now and then, and keep it somewhere other than this browser.

Delete this note whenever you like.`, 0),

    note('starter-note-work', 'starter-work', 'Weekly plan', `## This week's focus
-

## Tasks
- [ ] Review last week's notes
- [ ] Plan the three most important tasks
- [ ] Block time for focused work

## Meetings
| Day | Meeting | Notes |
|---|---|---|
| Monday | | |

## Wins and lessons
- `, 1),

    note('starter-note-ideas', 'starter-ideas', 'Idea capture', `Write the idea down first; shape it later.

## The idea
In one sentence:

## Why it matters
-

## Next small step
- [ ] Spend 15 minutes exploring it
- [ ] Link related notes`, 2),

    note('starter-note-research', 'starter-research', 'Research notes', `## Question
What am I trying to find out?

## Sources
1. Title, author, link or book page

## Key findings
- Finding, with the source it came from

## Open questions
-

Tip: give each topic its own note and connect them under **Linked notes** to build up a knowledge graph.`, 3),

    note('starter-note-health', 'starter-health', 'Health handbook', `A private place for health information you want close at hand.

## Contacts
| Who | Phone | Notes |
|---|---|---|
| Doctor | | |
| Pharmacy | | |

## Medications
| Name | Dose | When |
|---|---|---|
| | | |

## Appointments
- [ ] Next check-up:

## Log
Date: notes on how you feel, symptoms, or questions for your next visit.`, 4),
  ]
}
