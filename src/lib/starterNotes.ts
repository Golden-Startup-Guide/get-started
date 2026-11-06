import type { Note } from '../types'

/**
 * The note a brand-new library starts with, in the "Personal" notebook of "My notes". The built-in
 * handbooks are what there is to read on the first day; this note explains writing your own.
 *
 * The ID is fixed: importing a backup from another device that also has this note skips it as a
 * duplicate instead of creating a copy.
 */
export function starterNotes(now: number): Note[] {
  return [{
    id: 'starter-note-welcome',
    notebookId: 'starter-personal',
    title: 'Welcome to your Knowledge Library',
    content: `This library has two parts.

## Handbooks
The **Handbooks** in the sidebar come with the app: practical guides on health, growing food, money, and more. They are ready to read, even offline. You can't change a handbook, but you can make your own copy of any page, or write a note about it.

## Your notes
**My notes** is yours: private, and kept only on this device. Nothing is sent anywhere.

- Press **New note** and just type. The buttons above the note make text **bold** or *italic* and add headings, lists, and checklists.
- Link to another note, or to a handbook page, with the **Link to a note** button, like [[Staying hydrated]].
- [ ] Tick this box to try a checklist

## Keeping your notes safe
Export a backup from **Settings** now and then, and keep it somewhere other than this browser.

Delete this note whenever you like.`,
    createdAt: now,
    updatedAt: now,
    tags: [],
    pinned: false,
    favorite: false,
  }]
}
