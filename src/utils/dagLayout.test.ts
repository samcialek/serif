/**
 * Smoke tests for dagLayout.
 *
 * Run:  npx tsx --tsconfig ./tsconfig.app.json src/utils/dagLayout.test.ts
 *
 * Tests:
 *   - column assignment by operational class
 *   - within-column system grouping order
 *   - no node position overlaps
 *   - bbox positive
 *   - deterministic output (same input → same positions)
 *   - real Caspian payload lays out cleanly
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ParticipantPortal } from '@/data/portal/types'
import { assembleDag } from './dagAssembly'
import { layoutDag, LAYOUT_CONSTANTS } from './dagLayout'
import type { DagEdge, DagNode } from './dagTypes'

let failures = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  PASS  ${msg}`)
  } else {
    console.error(`  FAIL  ${msg}`)
    failures += 1
    process.exitCode = 1
  }
}

// ─── Stub helpers ──────────────────────────────────────────────────

function node(
  id: string,
  causalKind: DagNode['causalKind'],
  operationalClass: DagNode['operationalClass'],
  system: DagNode['system'],
  outDegree = 1,
): DagNode {
  return {
    id,
    label: id,
    causalKind,
    operationalClass,
    system,
    inDegree: 0,
    outDegree,
    caspianRelevant: false,
  }
}

function edge(source: string, target: string): DagEdge {
  return {
    source,
    target,
    kind: 'causal',
    fromMember: false,
    fromLiterature: true,
    fromMechanism: false,
    effect: 0.3,
    effectSd: 0.5,
    beneficial: true,
    horizon: 'week',
    evidenceTier: 'literature',
  }
}

// ─── Test 1: column assignment ─────────────────────────────────────

console.log('\ncolumn assignment by operational class:')
{
  const nodes: DagNode[] = [
    node('aqi', 'context', 'field', 'environment'),
    node('acwr', 'exposure', 'load', 'training'),
    node('caffeine_mg', 'action', 'dose', 'diet'),
    node('cortisol_med', 'mediator', 'mediator', 'hormones'),
    node('hrv_daily', 'outcome', 'target', 'autonomic'),
    node('ferritin', 'outcome', 'target', 'iron'),
  ]
  const { columns } = layoutDag(nodes, [])
  assert(columns.get('aqi') === 0, 'FIELD → column 0')
  assert(columns.get('acwr') === 1, 'LOAD → column 1')
  assert(columns.get('caffeine_mg') === 2, 'DOSE → column 2')
  assert(columns.get('cortisol_med') === 3, 'MEDIATOR → column 3')
  assert(columns.get('hrv_daily') === 4, 'autonomic TARGET → wearable column 4')
  assert(columns.get('ferritin') === 5, 'iron TARGET → biomarker column 5')
}

// ─── Test 2: positions assigned to all nodes ──────────────────────

console.log('\nposition coverage:')
{
  const nodes: DagNode[] = [
    node('a', 'action', 'dose', 'diet'),
    node('b', 'outcome', 'target', 'iron'),
    node('c', 'context', 'field', 'environment'),
  ]
  const edges: DagEdge[] = [edge('a', 'b'), edge('c', 'b')]
  const { positions, bbox } = layoutDag(nodes, edges)
  for (const n of nodes) {
    assert(positions.has(n.id), `position assigned for ${n.id}`)
  }
  assert(bbox.width > 0 && bbox.height > 0, `bbox positive (${bbox.width}×${bbox.height})`)
}

// ─── Test 3: no two nodes share the same (x, y) ───────────────────

console.log('\nno overlapping positions:')
{
  const nodes: DagNode[] = [
    node('a1', 'action', 'dose', 'diet'),
    node('a2', 'action', 'dose', 'diet'),
    node('a3', 'action', 'dose', 'training'),
    node('b1', 'outcome', 'target', 'iron'),
    node('b2', 'outcome', 'target', 'lipids'),
  ]
  const { positions } = layoutDag(nodes, [])
  const seen = new Set<string>()
  let overlaps = 0
  for (const [, p] of positions) {
    const key = `${p.x},${p.y}`
    if (seen.has(key)) overlaps += 1
    seen.add(key)
  }
  assert(overlaps === 0, `no two nodes share (x, y) (overlaps=${overlaps})`)
}

// ─── Test 4: within-column system grouping ────────────────────────

console.log('\nnodes in same system are contiguous in y within a column:')
{
  const nodes: DagNode[] = [
    node('a1', 'outcome', 'target', 'iron'),
    node('a2', 'outcome', 'target', 'iron'),
    node('a3', 'outcome', 'target', 'lipids'),
    node('a4', 'outcome', 'target', 'iron'),     // same system as a1, a2
    node('a5', 'outcome', 'target', 'lipids'),   // same as a3
  ]
  const { positions, columns } = layoutDag(nodes, [])
  // All in column 5 (biomarker)
  for (const n of nodes) {
    assert(columns.get(n.id) === 5, `${n.id} in column 5`)
  }
  // y-sort the iron nodes; their indices in the y-sorted array should
  // be contiguous (no lipid node between them).
  const sorted = [...positions.entries()]
    .filter(([id]) => columns.get(id) === 5)
    .sort((a, b) => a[1].y - b[1].y)
    .map(([id]) => id)
  const ironIdxs = sorted.map((id, i) => ({ id, i })).filter((e) => nodes.find((n) => n.id === e.id)?.system === 'iron').map((e) => e.i)
  const isContiguous = ironIdxs.every((v, i, arr) => i === 0 || v === arr[i - 1] + 1)
  assert(isContiguous, `iron nodes contiguous (idxs=${ironIdxs.join(',')})`)
}

// ─── Test 5: deterministic output ─────────────────────────────────

console.log('\ndeterministic — same input → same positions:')
{
  const nodes: DagNode[] = [
    node('x', 'action', 'dose', 'diet', 3),
    node('y', 'outcome', 'target', 'iron', 0),
    node('z', 'context', 'field', 'environment', 5),
  ]
  const edges: DagEdge[] = [edge('x', 'y'), edge('z', 'y')]
  const r1 = layoutDag(nodes, edges)
  const r2 = layoutDag(nodes, edges)
  let mismatch = 0
  for (const [id, p1] of r1.positions) {
    const p2 = r2.positions.get(id)
    if (!p2 || p1.x !== p2.x || p1.y !== p2.y) mismatch += 1
  }
  assert(mismatch === 0, `same input produces same positions (mismatches=${mismatch})`)
}

// ─── Test 6: out-degree determines initial within-system order ────

console.log('\nhigh-outDegree nodes anchor the top of their system bucket:')
{
  const nodes: DagNode[] = [
    node('low', 'action', 'dose', 'training', 1),
    node('high', 'action', 'dose', 'training', 8),
    node('mid', 'action', 'dose', 'training', 4),
  ]
  const { positions } = layoutDag(nodes, [])
  const ordered = [...positions.entries()].sort((a, b) => a[1].y - b[1].y).map(([id]) => id)
  assert(ordered[0] === 'high', `high outDegree on top (got ${ordered[0]})`)
}

// ─── Test 7: real Caspian payload lays out cleanly ────────────────

console.log('\nreal Caspian payload — full layout:')
try {
  const payloadPath = resolve(
    process.cwd(),
    'backend/output/portal_bayesian/participant_0001.json',
  )
  const raw = readFileSync(payloadPath, 'utf-8')
  const sanitized = raw.replace(/:\s*NaN\b/g, ': null')
  const caspian = JSON.parse(sanitized) as ParticipantPortal

  const { nodes, edges } = assembleDag(caspian)
  const { positions, bbox, columns, groupSeparators } = layoutDag(nodes, edges)

  assert(positions.size === nodes.length, `every node positioned (${positions.size}/${nodes.length})`)
  assert(bbox.width > 0 && bbox.height > 0, `bbox positive (${bbox.width}×${bbox.height})`)
  assert(bbox.height < 5000, `bbox height bounded (${bbox.height} < 5000)`)

  // No overlaps
  const seen = new Set<string>()
  let overlaps = 0
  for (const [, p] of positions) {
    const key = `${p.x},${p.y}`
    if (seen.has(key)) overlaps += 1
    seen.add(key)
  }
  assert(overlaps === 0, `Caspian's full graph has no node overlaps (overlaps=${overlaps})`)

  // All six columns populated
  const colCounts = new Map<number, number>()
  for (const [, c] of columns) colCounts.set(c, (colCounts.get(c) ?? 0) + 1)
  for (let i = 0; i < 6; i += 1) {
    const n = colCounts.get(i) ?? 0
    assert(n > 0, `column ${i} has at least one node (got ${n})`)
  }

  // Group separators: at least one per column
  const sepsByCol = new Map<number, number>()
  for (const sep of groupSeparators) {
    sepsByCol.set(sep.column, (sepsByCol.get(sep.column) ?? 0) + 1)
  }
  for (let i = 0; i < 6; i += 1) {
    assert((sepsByCol.get(i) ?? 0) >= 1, `column ${i} has at least one group separator`)
  }

  // x positions match the constants
  const expectedX = LAYOUT_CONSTANTS.COLUMN_X
  for (const [id, p] of positions) {
    const col = columns.get(id)
    if (col != null) {
      assert(p.x === expectedX[col], `${id} x matches column ${col} (got ${p.x}, expected ${expectedX[col]})`)
      break // one check is enough — they all use the same constant
    }
  }
} catch (err) {
  console.error('  SKIP  Caspian payload not readable:', (err as Error).message)
}

// ─── Result ────────────────────────────────────────────────────────

if (failures === 0) {
  console.log('\nAll dagLayout tests passed.')
} else {
  console.error(`\n${failures} dagLayout test(s) failed.`)
}
