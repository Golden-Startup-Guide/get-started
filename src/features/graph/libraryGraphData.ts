import type { Library, Note, Notebook, NoteLink, Shelf } from '../../types'
import { t } from '../../i18n/i18n'

/** Colours for libraries in the graph, in order; notes outside any library use the last. */
export const LIBRARY_COLOURS = ['#d77762', '#4f8fc0', '#6aa864', '#b07cc6', '#d1a23f', '#4aa8a0', '#c46f9b', '#8a8f98']
export const UNFILED_COLOUR = '#9aa0a8'

export interface GraphNode {
  id: string
  label: string
  /** Colour of the note's library. */
  colour: string
  /** Links to and from other notes in the graph. */
  degree: number
  /** The note's notebook, so new notes can start beside the rest of it. */
  group: string
}

export interface LibraryGraphData {
  nodes: GraphNode[]
  /** Each linked pair once, as indexes into `nodes`, whichever way (or both ways) they link. */
  edges: Array<[number, number]>
  /** Libraries with notes in the graph, with their colours, for the legend. */
  legend: Array<{ name: string; colour: string }>
}

/**
 * The whole-library graph: every note not in Trash, and every link between two of them. Links in
 * both directions, or recorded both as a stored link and in the text, are drawn once.
 */
export function buildLibraryGraph(
  notes: readonly Note[],
  links: readonly NoteLink[],
  notebooks: readonly Notebook[],
  shelves: readonly Shelf[],
  libraries: readonly Library[],
  noteLabel: (note: Note) => string,
): LibraryGraphData {
  const shelfLibrary = new Map(shelves.map((shelf) => [shelf.id, shelf.libraryId]))
  const notebookLibrary = new Map(notebooks.map((notebook) => [notebook.id, notebook.shelfId ? shelfLibrary.get(notebook.shelfId) : undefined]))
  const colourOf = new Map(libraries.map((library, index) => [library.id, LIBRARY_COLOURS[index % LIBRARY_COLOURS.length]]))

  const nodes: GraphNode[] = []
  const indexOf = new Map<string, number>()
  const usedLibraries = new Set<string>()
  let unfiled = false
  for (const note of notes) {
    if (note.deletedAt !== undefined) continue
    const libraryId = notebookLibrary.get(note.notebookId ?? '')
    const colour = (libraryId && colourOf.get(libraryId)) || UNFILED_COLOUR
    if (libraryId && colourOf.has(libraryId)) usedLibraries.add(libraryId)
    else unfiled = true
    indexOf.set(note.id, nodes.length)
    nodes.push({ id: note.id, label: noteLabel(note), colour, degree: 0, group: note.notebookId ?? '' })
  }

  const edges: Array<[number, number]> = []
  const seen = new Set<string>()
  for (const link of links) {
    const source = indexOf.get(link.sourceNoteId)
    const target = indexOf.get(link.targetNoteId)
    if (source === undefined || target === undefined || source === target) continue
    const key = source < target ? `${source} ${target}` : `${target} ${source}`
    if (seen.has(key)) continue
    seen.add(key)
    edges.push(source < target ? [source, target] : [target, source])
    nodes[source].degree += 1
    nodes[target].degree += 1
  }

  const legend = libraries.filter((library) => usedLibraries.has(library.id)).map((library) => ({ name: library.name, colour: colourOf.get(library.id) as string }))
  if (unfiled) legend.push({ name: t('Not on a shelf'), colour: UNFILED_COLOUR })
  return { nodes, edges, legend }
}

/** A dot's size: bigger for notes with more links, without hubs swamping the view. */
export const nodeSize = (degree: number) => 4 + Math.min(10, Math.sqrt(degree) * 2)

/**
 * Starting positions for notes without one yet: each notebook gets its own patch of a large
 * spiral, so notes that belong together start close and the layout settles sooner.
 */
export function seedPositions(nodes: readonly GraphNode[], known: ReadonlyMap<string, { x: number; y: number }>): Float32Array {
  const positions = new Float32Array(nodes.length * 2)
  const groupCentre = new Map<string, { x: number; y: number; placed: number }>()
  const golden = Math.PI * (3 - Math.sqrt(5))
  const spread = Math.sqrt(nodes.length) * 10
  nodes.forEach((node, index) => {
    const position = known.get(node.id)
    if (position) {
      positions[index * 2] = position.x
      positions[index * 2 + 1] = position.y
      return
    }
    let centre = groupCentre.get(node.group)
    if (!centre) {
      const turn = groupCentre.size
      const radius = spread * Math.sqrt((turn + 0.5) / 12)
      centre = { x: Math.cos(turn * golden) * radius, y: Math.sin(turn * golden) * radius, placed: 0 }
      groupCentre.set(node.group, centre)
    }
    // A small spiral around the notebook's centre.
    centre.placed += 1
    const angle = centre.placed * golden
    const distance = 4 * Math.sqrt(centre.placed)
    positions[index * 2] = centre.x + Math.cos(angle) * distance
    positions[index * 2 + 1] = centre.y + Math.sin(angle) * distance
  })
  return positions
}

/** Whether the browser can draw the whole-library graph (it needs WebGL 2). */
export function canDrawLibraryGraph(): boolean {
  try {
    return typeof WebGL2RenderingContext !== 'undefined' && Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    return false
  }
}
