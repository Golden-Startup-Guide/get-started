/// <reference lib="webworker" />
import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'

/**
 * Lays out the whole-library graph off the main thread with ForceAtlas2, so the page stays
 * responsive however large the library. Positions are posted back as the layout settles, so the
 * graph can be drawn straight away and move into place.
 */
export interface LayoutRequest {
  /** Two numbers (x, y) per note. */
  positions: Float32Array
  /** Two note indexes per link. */
  edges: Uint32Array
  /** Most of the notes already have a settled position, so a short run is enough. */
  settled: boolean
}

export interface LayoutResponse {
  positions: Float32Array
  done: boolean
}

// How long to compute before posting positions (each post redraws the whole graph, so large
// graphs get fewer), and how long in all.
const sliceFor = (count: number) => (count > 20_000 ? 4_000 : count > 5_000 ? 1_000 : 120)
const BUDGET_MS = 12_000

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { positions, edges, settled } = event.data
  const count = positions.length / 2
  const graph = new Graph({ type: 'undirected', multi: false, allowSelfLoops: false })
  for (let index = 0; index < count; index += 1) {
    graph.addNode(index, { x: positions[index * 2], y: positions[index * 2 + 1], size: 4 })
  }
  for (let index = 0; index < edges.length; index += 2) graph.mergeEdge(edges[index], edges[index + 1])

  // Smaller graphs keep dots from overlapping (sizes are on screen, so this is approximate).
  const settings = { ...forceAtlas2.inferSettings(graph), barnesHutOptimize: count > 500, adjustSizes: count <= 500 }
  // Small graphs settle in a few hundred iterations; large ones run until the time budget is spent.
  const iterationsWanted = settled ? 60 : count < 2_000 ? 600 : Infinity
  const started = performance.now()
  let iterations = 0
  // A few iterations at a time, timing them to fill each slice.
  let step = 1
  const SLICE_MS = sliceFor(count)
  while (iterations < iterationsWanted && performance.now() - started < BUDGET_MS) {
    const sliceStart = performance.now()
    while (performance.now() - sliceStart < SLICE_MS && iterations < iterationsWanted) {
      const chunk = Math.min(step, iterationsWanted - iterations)
      const chunkStart = performance.now()
      forceAtlas2.assign(graph, { iterations: chunk, settings })
      iterations += chunk
      if (performance.now() - chunkStart < SLICE_MS / 4) step = Math.min(step * 2, 64)
    }
    const done = iterations >= iterationsWanted || performance.now() - started >= BUDGET_MS
    const output = new Float32Array(count * 2)
    graph.forEachNode((node, attributes) => {
      const index = Number(node)
      output[index * 2] = attributes.x as number
      output[index * 2 + 1] = attributes.y as number
    })
    self.postMessage({ positions: output, done } satisfies LayoutResponse, [output.buffer])
    if (done) return
  }
}
