/**
 * DAG layout — pure positional metadata, no DOM.
 *
 * Strategy: banded hierarchical with within-band system grouping.
 *
 *   - Six fixed columns by causal role:
 *       0 CONTEXT  (FIELDS)     — environment, season, weekend, travel
 *       1 EXPOSURE (LOADS)      — ACWR, sleep_debt, training_load
 *       2 ACTION   (DOSES)      — bedtime, supps, dietary_*
 *       3 MEDIATOR              — ground_contacts, lipoprotein_lipase, ...
 *       4 WEARABLE              — HRV, sleep stages, resting_hr
 *       5 BIOMARKER             — ferritin, lipids, hormones, hsCRP, ...
 *
 *   - Within each column, nodes are grouped by PhysSystem (sleep / iron /
 *     lipids / hormones / inflammation / autonomic / metabolic / ...). Each
 *     group is sorted by outDegree descending so the system anchor sits
 *     on top.
 *
 *   - Within-group order is then refined by a two-pass median heuristic
 *     to reduce edge crossings — forward (re-rank each layer by median
 *     y of incoming edges' sources) then backward (re-rank by median y
 *     of outgoing edges' targets).
 *
 *   - Each column has its own y axis. Rows do NOT align horizontally
 *     across columns — alignment would force tall empty stretches; the
 *     payoff is compactness per-column.
 *
 * Output: Map<nodeId, {x, y}> (center of node), bbox, group separators.
 */

import type {
  DagEdge,
  DagNode,
  LaidOutDag,
  PhysSystem,
} from './dagTypes'
import { DAG_COLUMNS } from './dagTypes'

// ─── Layout constants ──────────────────────────────────────────────

const COLUMN_X = [0, 280, 560, 880, 1200, 1480] // x-center for each column
const NODE_WIDTH = 220
const ROW_HEIGHT = 36
const GROUP_GAP = 20            // extra y gap between system groups
const COLUMN_TOP_PADDING = 24
const BBOX_RIGHT_PADDING = NODE_WIDTH / 2 + 24

// Stable system ordering within a column. Roughly anchors related
// systems near each other for cleaner cross-column edges.
const SYSTEM_ORDER: PhysSystem[] = [
  'environment',
  'training',
  'diet',
  'supplements',
  'sleep',
  'autonomic',
  'inflammation',
  'immune',
  'iron',
  'metabolic',
  'lipids',
  'hormones',
  'cardio',
  'body_comp',
  'renal',
  'other',
]

// ─── Public API ────────────────────────────────────────────────────

export function layoutDag(nodes: DagNode[], edges: DagEdge[]): LaidOutDag {
  // ─── 1. Assign every node to a column ──────────────────────────
  const columns = new Map<string, number>()
  for (const node of nodes) {
    columns.set(node.id, columnFor(node))
  }

  // ─── 2. Group nodes by (column, system) ────────────────────────
  // Each column gets a Map<system, ordered nodeIds>.
  const perColumn: Array<Map<PhysSystem, DagNode[]>> = DAG_COLUMNS.map(
    () => new Map<PhysSystem, DagNode[]>(),
  )

  for (const node of nodes) {
    const col = columns.get(node.id) ?? 2
    const sysMap = perColumn[col]
    let bucket = sysMap.get(node.system)
    if (!bucket) {
      bucket = []
      sysMap.set(node.system, bucket)
    }
    bucket.push(node)
  }

  // Initial within-group order: by outDegree desc, tiebreak by id asc.
  for (const sysMap of perColumn) {
    for (const bucket of sysMap.values()) {
      bucket.sort((a, b) => {
        if (b.outDegree !== a.outDegree) return b.outDegree - a.outDegree
        return a.id < b.id ? -1 : 1
      })
    }
  }

  // ─── 3. Assemble per-column flat order, respecting SYSTEM_ORDER ─
  const orderedPerColumn: DagNode[][] = perColumn.map((sysMap) => {
    const flat: DagNode[] = []
    for (const sys of SYSTEM_ORDER) {
      const bucket = sysMap.get(sys)
      if (bucket) flat.push(...bucket)
    }
    // Pick up any system buckets that weren't in SYSTEM_ORDER (defensive).
    for (const [sys, bucket] of sysMap) {
      if (!SYSTEM_ORDER.includes(sys)) flat.push(...bucket)
    }
    return flat
  })

  // ─── 4. Two-pass median heuristic to reduce crossings ──────────
  // Build a cheap edge-by-source / edge-by-target index.
  const causalEdges = edges.filter((e) => e.kind === 'causal')
  const outById = groupBy(causalEdges, (e) => e.source)
  const inById = groupBy(causalEdges, (e) => e.target)

  // Forward pass: re-order each column by median y of in-edges' sources.
  for (let col = 1; col < orderedPerColumn.length; col += 1) {
    const layer = orderedPerColumn[col]
    if (layer.length === 0) continue
    medianReorderWithinSystem(layer, (n) => {
      const incoming = inById.get(n.id) ?? []
      const sourceYs = incoming
        .map((e) => yOfNode(e.source, orderedPerColumn))
        .filter((y): y is number => y != null)
      return median(sourceYs)
    })
  }

  // Backward pass: re-order each column by median y of out-edges' targets.
  for (let col = orderedPerColumn.length - 2; col >= 0; col -= 1) {
    const layer = orderedPerColumn[col]
    if (layer.length === 0) continue
    medianReorderWithinSystem(layer, (n) => {
      const outgoing = outById.get(n.id) ?? []
      const targetYs = outgoing
        .map((e) => yOfNode(e.target, orderedPerColumn))
        .filter((y): y is number => y != null)
      return median(targetYs)
    })
  }

  // ─── 5. Compute final positions and group separators ───────────
  const positions = new Map<string, { x: number; y: number }>()
  const groupSeparators: LaidOutDag['groupSeparators'] = []
  let maxHeight = 0

  for (let col = 0; col < orderedPerColumn.length; col += 1) {
    const layer = orderedPerColumn[col]
    let y = COLUMN_TOP_PADDING
    let prevSystem: PhysSystem | null = null
    let groupStartY: number | null = null
    let groupSystem: PhysSystem | null = null

    for (const node of layer) {
      // Open a new group if the system changed
      if (node.system !== prevSystem) {
        // Close the previous group
        if (prevSystem != null && groupStartY != null && groupSystem != null) {
          groupSeparators.push({
            column: col,
            system: groupSystem,
            yTop: groupStartY,
            yBottom: y,
          })
          y += GROUP_GAP
        }
        groupSystem = node.system
        groupStartY = y
        prevSystem = node.system
      }
      positions.set(node.id, { x: COLUMN_X[col], y })
      y += ROW_HEIGHT
    }
    // Close the last group of the column
    if (prevSystem != null && groupStartY != null && groupSystem != null) {
      groupSeparators.push({
        column: col,
        system: groupSystem,
        yTop: groupStartY,
        yBottom: y,
      })
    }
    if (y > maxHeight) maxHeight = y
  }

  const bbox = {
    width: COLUMN_X[COLUMN_X.length - 1] + BBOX_RIGHT_PADDING,
    height: maxHeight + COLUMN_TOP_PADDING,
  }

  return { positions, columns, bbox, groupSeparators }
}

// ─── Column assignment ─────────────────────────────────────────────

/** Map a node to one of the six columns based on operational/causal role. */
function columnFor(node: DagNode): number {
  // Operational class is the primary signal — it captures what the user
  // sees the node as. CausalKind is the fallback.
  switch (node.operationalClass) {
    case 'field':
      return 0 // CONTEXT
    case 'load':
      return 1 // EXPOSURE
    case 'dose':
      return 2 // ACTION
    case 'mediator':
      return 3 // MEDIATOR
    case 'target': {
      // Wearables vs biomarkers. Use system to decide: sleep/autonomic
      // tend to be wearable-resolved; everything else biomarker.
      if (
        node.system === 'sleep' ||
        node.system === 'autonomic' ||
        node.system === 'body_comp'
      ) {
        return 4 // WEARABLE
      }
      return 5 // BIOMARKER
    }
    case 'constant':
      // Constants live off-graph — but if one slips in, park it in column 0.
      return 0
  }
}

// ─── Within-system median reorder ──────────────────────────────────

/**
 * Reorder a layer in place, respecting system grouping. Within each
 * system bucket, reorder nodes by the supplied median key (smallest
 * median y first). Nodes with no incoming/outgoing edges keep their
 * current rank.
 */
function medianReorderWithinSystem(
  layer: DagNode[],
  key: (n: DagNode) => number | null,
): void {
  // Group by system, preserving the SYSTEM_ORDER given by initial layout.
  const buckets = new Map<PhysSystem, DagNode[]>()
  for (const n of layer) {
    let b = buckets.get(n.system)
    if (!b) {
      b = []
      buckets.set(n.system, b)
    }
    b.push(n)
  }

  const sortedSystems = orderedSystems(layer)

  // Sort each bucket by median key. Stable for ties.
  for (const sys of sortedSystems) {
    const bucket = buckets.get(sys)!
    bucket
      .map((n, i) => ({ n, i, k: key(n) }))
      .sort((a, b) => {
        const ak = a.k
        const bk = b.k
        // Null medians (no edges) keep original order.
        if (ak == null && bk == null) return a.i - b.i
        if (ak == null) return 1
        if (bk == null) return -1
        if (ak !== bk) return ak - bk
        return a.i - b.i
      })
      .forEach((entry, idx) => {
        bucket[idx] = entry.n
      })
  }

  // Rebuild the flat layer in system order.
  layer.length = 0
  for (const sys of sortedSystems) {
    const bucket = buckets.get(sys)
    if (bucket) layer.push(...bucket)
  }
}

function orderedSystems(layer: DagNode[]): PhysSystem[] {
  const present = new Set<PhysSystem>()
  for (const n of layer) present.add(n.system)
  const out: PhysSystem[] = []
  for (const sys of SYSTEM_ORDER) {
    if (present.has(sys)) out.push(sys)
  }
  // Defensive: any systems not in SYSTEM_ORDER append at the end.
  for (const sys of present) {
    if (!SYSTEM_ORDER.includes(sys)) out.push(sys)
  }
  return out
}

// ─── y-of-node lookup against current layered order ────────────────

function yOfNode(id: string, layered: DagNode[][]): number | null {
  // y in this pass uses the *index within layer* as a proxy for vertical
  // rank. Exact pixel y doesn't matter for the median-heuristic — only
  // ordering does.
  for (const layer of layered) {
    const idx = layer.findIndex((n) => n.id === id)
    if (idx >= 0) return idx
  }
  return null
}

// ─── Generic helpers ───────────────────────────────────────────────

function median(arr: number[]): number | null {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

function groupBy<T, K>(arr: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>()
  for (const item of arr) {
    const k = keyFn(item)
    let bucket = m.get(k)
    if (!bucket) {
      bucket = []
      m.set(k, bucket)
    }
    bucket.push(item)
  }
  return m
}

// ─── Layout constants exported for the renderer ────────────────────

export const LAYOUT_CONSTANTS = {
  COLUMN_X,
  NODE_WIDTH,
  ROW_HEIGHT,
  GROUP_GAP,
  COLUMN_TOP_PADDING,
} as const
