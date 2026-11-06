import { useEffect, useMemo, useRef, useState } from 'react'
import Graph from 'graphology'
import Sigma from 'sigma'
import { ExternalLink, Maximize, Network, ZoomIn, ZoomOut } from 'lucide-react'
import { useLibraryStore } from '../../state/libraryStore'
import type { Note, NoteLink } from '../../types'
import { buildLibraryGraph, nodeSize, seedPositions, type LibraryGraphData } from './libraryGraphData'
import type { LayoutRequest, LayoutResponse } from './graphLayout.worker'
import { t, tp } from '../../i18n/i18n'

interface LibraryGraphProps {
  /** Every note; those in Trash are left out. */
  notes: readonly Note[]
  links: readonly NoteLink[]
  /** Notes matching the search, or undefined to show every note. */
  matchingIds: ReadonlySet<string> | undefined
  noteLabel: (note: Note) => string
  /** 'light' or 'dark', to redraw labels and links in the theme's colours. */
  theme: string
  onOpenNote: (note: Note) => void
  /** Shows the note in the "Around a note" view. */
  onExplore: (note: Note) => void
}

// What each note is drawn with; the reducers set the optional look on their own copy.
type NodeAttributes = {
  x: number
  y: number
  size: number
  color: string
  label: string
  hidden?: boolean
  highlighted?: boolean
  forceLabel?: boolean
  zIndex?: number
}

// Where each note was last placed, kept while the app is open, so returning to the graph (or
// adding a note) starts from the settled layout instead of from scratch.
const knownPositions = new Map<string, { x: number; y: number }>()

// A search that leaves this few notes lists them under the graph, to select from the keyboard.
const MAX_LISTED_MATCHES = 50
// ...and this few, names them all in the graph.
const NAME_ALL_BELOW = 15

// Ochre: visible on both the light and dark canvases.
const ACCENT = '#a56722'

const edgeKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`)

/**
 * Every note in the library as a dot, coloured by library and sized by its number of links, with
 * a line for each link. Drawn with WebGL (sigma.js), so large libraries stay smooth; the layout
 * is worked out in a worker (graphLayout.worker.ts) and settles while you watch.
 *
 * Point at a note to pick out its links; select it to open it or explore around it. The search
 * box narrows the graph to matching notes, without moving them.
 */
export default function LibraryGraph({ notes, links, matchingIds, noteLabel, theme, onOpenNote, onExplore }: LibraryGraphProps) {
  const notebooks = useLibraryStore((state) => state.notebooks)
  const shelves = useLibraryStore((state) => state.shelves)
  const libraries = useLibraryStore((state) => state.libraries)
  const data = useMemo(
    () => buildLibraryGraph(notes, links, notebooks, shelves, libraries, noteLabel),
    [notes, links, notebooks, shelves, libraries, noteLabel],
  )
  const noteById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes])

  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph<NodeAttributes> | null>(null)
  const sigmaRef = useRef<Sigma<NodeAttributes> | null>(null)
  const workerRef = useRef<Worker | null>(null)
  // Selects a note (or clears the selection), set once the drawing exists.
  const pickRef = useRef<(node: string | undefined, centre?: boolean) => void>(() => {})
  // Read by the reducers, which sigma calls for every note and link it redraws.
  const view = useRef<{
    focus?: string
    neighbours: Set<string>
    focusEdges: Set<string>
    matching?: ReadonlySet<string>
  }>({ neighbours: new Set(), focusEdges: new Set() })
  const [selected, setSelected] = useState<string>()
  const [settledFor, setSettledFor] = useState<LibraryGraphData>()
  const [failed, setFailed] = useState(false)

  // Create the drawing once.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const graph = new Graph<NodeAttributes>({ type: 'undirected', multi: false, allowSelfLoops: false })
    graphRef.current = graph
    let sigma: Sigma<NodeAttributes>
    try {
      sigma = new Sigma(graph, container, {
        renderEdgeLabels: false,
        labelDensity: 0.8,
        labelFont: 'system-ui, sans-serif',
        minCameraRatio: 0.02,
        maxCameraRatio: 3,
        zIndex: true,
        allowInvalidContainer: true,
        // Each reducer gets its own copy of the note's or link's look, to change and return.
        nodeReducer: (key, display) => {
          const { focus, neighbours, matching } = view.current
          if (matching && !matching.has(key)) {
            display.hidden = true
          } else if (key === focus) {
            display.highlighted = true
            display.forceLabel = true
            display.zIndex = 2
          } else if (focus && neighbours.has(key)) {
            display.forceLabel = true
            display.zIndex = 1
          } else if (matching && matching.size <= NAME_ALL_BELOW) {
            // A search that leaves a few notes names them all.
            display.forceLabel = true
          }
          return display
        },
        edgeReducer: (key, display) => {
          const { focusEdges, matching } = view.current
          if (matching) {
            const [source, target] = graph.extremities(key)
            if (!matching.has(source) || !matching.has(target)) {
              display.hidden = true
              return display
            }
          }
          if (focusEdges.has(key)) {
            display.color = ACCENT
            display.size = 1.5
            display.zIndex = 1
          }
          return display
        },
      })
    } catch {
      // No WebGL 2 after all (or the context was refused); the "Around a note" view still works.
      queueMicrotask(() => setFailed(true))
      return
    }
    sigmaRef.current = sigma

    // Pointing at a note picks out it, its neighbours, and its links; only those are redrawn.
    const focusOn = (node: string | undefined) => {
      const current = view.current
      if (current.focus === node) return
      const nodes = new Set([...(current.focus ? [current.focus] : []), ...current.neighbours])
      const edges = new Set(current.focusEdges)
      current.focus = node
      current.neighbours = node ? new Set(graph.neighbors(node)) : new Set()
      current.focusEdges = node ? new Set(graph.edges(node)) : new Set()
      if (node) nodes.add(node)
      for (const neighbour of current.neighbours) nodes.add(neighbour)
      for (const edge of current.focusEdges) edges.add(edge)
      sigma.refresh({ partialGraph: { nodes: [...nodes], edges: [...edges] }, skipIndexation: true })
    }
    let picked: string | undefined
    const pick = (node: string | undefined, centre = false) => {
      picked = node && graph.hasNode(node) ? node : undefined
      setSelected(picked)
      focusOn(picked)
      const position = picked && sigma.getNodeDisplayData(picked)
      if (centre && position) {
        const camera = sigma.getCamera()
        void camera.animate({ x: position.x, y: position.y, ratio: Math.min(camera.getState().ratio, 0.5) }, { duration: 300 })
      }
    }
    pickRef.current = pick
    sigma.on('enterNode', ({ node }) => focusOn(node))
    sigma.on('leaveNode', () => focusOn(picked))
    sigma.on('clickNode', ({ node }) => pick(node))
    sigma.on('clickStage', () => pick(undefined))
    return () => {
      sigma.kill()
      sigmaRef.current = null
      graphRef.current = null
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  // The theme's colours for labels and lines.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const styles = getComputedStyle(container)
    sigmaRef.current?.setSetting('labelColor', { color: styles.getPropertyValue('--text').trim() || '#222' })
    sigmaRef.current?.setSetting('defaultEdgeColor', styles.getPropertyValue('--border').trim() || '#ccc')
  }, [theme])

  // Narrow to the search, redrawing only the notes that came or went (and their links) as the
  // search is typed, rather than the whole library on each keystroke.
  useEffect(() => {
    const sigma = sigmaRef.current
    const graph = graphRef.current
    const previous = view.current.matching
    view.current.matching = matchingIds
    if (!sigma || !graph || previous === matchingIds) return
    if (!previous || !matchingIds) {
      sigma.refresh({ skipIndexation: true })
      return
    }
    const changed: string[] = []
    for (const id of previous) if (!matchingIds.has(id)) changed.push(id)
    for (const id of matchingIds) if (!previous.has(id)) changed.push(id)
    // Crossing the "name them all" size changes the look of every note left.
    if ((previous.size <= NAME_ALL_BELOW) !== (matchingIds.size <= NAME_ALL_BELOW)) changed.push(...previous, ...matchingIds)
    if (changed.length > graph.order / 4) {
      sigma.refresh({ skipIndexation: true })
      return
    }
    const nodes = changed.filter((id) => graph.hasNode(id))
    sigma.refresh({ partialGraph: { nodes, edges: nodes.flatMap((id) => graph.edges(id)) }, skipIndexation: true })
  }, [matchingIds])

  // Bring the drawing in step with the library: only what changed is updated, and the layout runs
  // again only when notes or links were added or removed.
  useEffect(() => {
    const graph = graphRef.current
    const sigma = sigmaRef.current
    if (!graph || !sigma) return
    // A small library has room to name every note; a large one names those with room around them.
    sigma.setSetting('labelRenderedSizeThreshold', data.nodes.length <= 150 ? 0 : 8)
    // Drawing tens of thousands of links on every frame of a pan or zoom is slow without a fast
    // graphics card; large graphs leave them out until the view stops moving.
    sigma.setSetting('hideEdgesOnMove', data.edges.length > 5_000)
    const wanted = new Set<string>()
    let added = 0
    let topologyChanged = false
    const seeds = seedPositions(data.nodes, new Map(data.nodes.map((node) => [node.id, graph.hasNode(node.id) ? graph.getNodeAttributes(node.id) : knownPositions.get(node.id)]).filter((entry): entry is [string, { x: number; y: number }] => Boolean(entry[1]))))
    data.nodes.forEach((node, index) => {
      wanted.add(node.id)
      const size = nodeSize(node.degree)
      if (!graph.hasNode(node.id)) {
        if (!knownPositions.has(node.id)) added += 1
        graph.addNode(node.id, { x: seeds[index * 2], y: seeds[index * 2 + 1], size, color: node.colour, label: node.label })
        topologyChanged = true
        return
      }
      const current = graph.getNodeAttributes(node.id)
      if (current.size !== size || current.color !== node.colour || current.label !== node.label) {
        graph.mergeNodeAttributes(node.id, { size, color: node.colour, label: node.label })
      }
    })
    for (const node of graph.nodes()) {
      if (!wanted.has(node)) {
        graph.dropNode(node)
        topologyChanged = true
      }
    }
    const wantedEdges = new Set(data.edges.map(([a, b]) => edgeKey(data.nodes[a].id, data.nodes[b].id)))
    graph.forEachEdge((edge, _attributes, source, target) => {
      if (!wantedEdges.has(edgeKey(source, target))) {
        graph.dropEdge(edge)
        topologyChanged = true
      }
    })
    for (const [a, b] of data.edges) {
      const source = data.nodes[a].id
      const target = data.nodes[b].id
      if (!graph.hasEdge(source, target)) {
        graph.addEdge(source, target)
        topologyChanged = true
      }
    }

    if (!topologyChanged || !graph.order) {
      queueMicrotask(() => setSettledFor(data))
      return
    }
    // Lay out again, from where every note is now.
    workerRef.current?.terminate()
    const order = graph.nodes()
    const indexOf = new Map(order.map((node, index) => [node, index]))
    const positions = new Float32Array(order.length * 2)
    order.forEach((node, index) => {
      const { x, y } = graph.getNodeAttributes(node)
      positions[index * 2] = x
      positions[index * 2 + 1] = y
    })
    const edges = new Uint32Array(graph.size * 2)
    let edgeIndex = 0
    graph.forEachEdge((_edge, _attributes, source, target) => {
      edges[edgeIndex++] = indexOf.get(source) as number
      edges[edgeIndex++] = indexOf.get(target) as number
    })
    const worker = new Worker(new URL('./graphLayout.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (event: MessageEvent<LayoutResponse>) => {
      if (workerRef.current !== worker || !graphRef.current) return
      const next = event.data.positions
      graph.updateEachNodeAttributes((node, attributes) => {
        const index = indexOf.get(node)
        if (index === undefined) return attributes
        const position = { x: next[index * 2], y: next[index * 2 + 1] }
        knownPositions.set(node, position)
        return { ...attributes, ...position }
      }, { attributes: ['x', 'y'] })
      if (event.data.done) {
        worker.terminate()
        workerRef.current = null
        setSettledFor(data)
      }
    }
    worker.onerror = () => {
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
      setSettledFor(data)
    }
    const request: LayoutRequest = { positions, edges, settled: added < Math.max(10, order.length / 10) && knownPositions.size > 0 }
    worker.postMessage(request, [positions.buffer, edges.buffer])
  }, [data])

  const camera = () => sigmaRef.current?.getCamera()
  const zoom = (factor: number) => {
    const current = camera()
    void current?.animate({ ratio: current.getState().ratio * factor }, { duration: 200 })
  }

  if (failed) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Network size={24} aria-hidden="true" /></span>
        <p className="mt-4 max-w-sm text-sm text-[var(--muted)]">{t("This browser cannot draw the whole-library graph (it needs WebGL 2). Use")} <strong>{t("Around a note")}</strong> {t("instead.")}</p>
      </div>
    )
  }

  const selectedNote = selected ? noteById.get(selected) : undefined
  const selectedNode = selectedNote && data.nodes.find((node) => node.id === selectedNote.id)
  const matches = matchingIds ? data.nodes.filter((node) => matchingIds.has(node.id)) : data.nodes
  const shown = matches.length
  const arranging = settledFor !== data

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]" role="status" aria-live="polite">
          {shown === data.nodes.length ? tp(data.nodes.length, '{count} note', '{count} notes') : t('{shown} of {total} notes', { shown, total: data.nodes.length })}
          {' · '}{tp(data.edges.length, '{count} link', '{count} links')}
          {arranging && t(" · Arranging…")}
        </p>
        <div className="flex items-center gap-1">
          <button type="button" className="icon-button !h-8 !w-8" onClick={() => zoom(1 / 1.5)} aria-label={t("Zoom in")} title={t("Zoom in")}><ZoomIn size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button !h-8 !w-8" onClick={() => zoom(1.5)} aria-label={t("Zoom out")} title={t("Zoom out")}><ZoomOut size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button !h-8 !w-8" onClick={() => void camera()?.animatedReset({ duration: 300 })} aria-label={t("Show the whole graph")} title={t("Show the whole graph")}><Maximize size={16} aria-hidden="true" /></button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="library-graph"
        role="img"
        aria-label={t("Graph of {shown} notes and their links. Drag to move, scroll or pinch to zoom, and select a note to open it. From the keyboard, search to list notes below the graph, or use Around a note.", { shown })}
      />
      {matchingIds && shown > 0 && shown <= MAX_LISTED_MATCHES && (
        <nav aria-label={t("Notes in the graph")} className="flex flex-wrap gap-2">
          {matches.map((node) => (
            <button
              key={node.id}
              type="button"
              className="graph-match"
              aria-pressed={node.id === selected}
              onClick={() => pickRef.current(node.id === selected ? undefined : node.id, true)}
            >
              <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: node.colour }} aria-hidden="true" />
              <span className="truncate">{node.label}</span>
            </button>
          ))}
        </nav>
      )}
      {selectedNote && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="min-w-0">
            <p className="section-label">{t("Selected note")}</p>
            <p className="truncate font-medium">{noteLabel(selectedNote)}</p>
            <p className="text-xs text-[var(--muted)]">{tp(selectedNode?.degree ?? 0, '{count} linked note', '{count} linked notes')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="secondary-button" onClick={() => onExplore(selectedNote)}><Network size={15} aria-hidden="true" /> {t("Explore around it")}</button>
            <button type="button" className="secondary-button" onClick={() => onOpenNote(selectedNote)}><ExternalLink size={15} aria-hidden="true" /> {t("Open in editor")}</button>
          </div>
        </div>
      )}
      {data.legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]" aria-label={t("Colours by library")}>
          {data.legend.map((entry) => (
            <li key={entry.name} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: entry.colour }} aria-hidden="true" />
              {entry.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
