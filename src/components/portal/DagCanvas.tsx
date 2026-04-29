/**
 * DagCanvas — full-graph SVG render for the EdgeMapView "DAG" mode.
 *
 * Phase 4 (v1): banded SVG render
 * Phase 5 (v2): native viewBox pan/zoom + LOD
 *
 *   - Wheel: pan vertically (deltaY) or horizontally (deltaX); with
 *     Ctrl/Meta, zoom toward the cursor
 *   - Drag on canvas (not on a node): pan
 *   - Keyboard: + / − zoom, 0 fit-bounds, ESC clears
 *   - Pan/zoom updates write to a ref + rAF, NOT React state
 *   - Three LOD tiers based on effective scale (clientWidth ÷ viewBox.w):
 *       bird   (< 0.6) — hide labels, thin uniform edges
 *       fit    (0.6–1.2) — standard rendering
 *       detail (≥ 1.2) — full rendering with arrowheads
 *
 *   Confounder edges are suppressed in the visual layer (focus-only,
 *   surfaces in Phase 6).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Plus, Minus, Maximize2 } from 'lucide-react'
import type { ParticipantPortal } from '@/data/portal/types'
import { assembleDag } from '@/utils/dagAssembly'
import { layoutDag, LAYOUT_CONSTANTS } from '@/utils/dagLayout'
import type {
  DagEdge,
  DagNode,
  EvidenceTier,
  OperationalClass,
  PhysSystem,
} from '@/utils/dagTypes'
import { TEXT_INK, TEXT_MUTED } from '@/styles/painterlyTokens'

const { COLUMN_X, NODE_WIDTH, ROW_HEIGHT } = LAYOUT_CONSTANTS
const NODE_HEIGHT = ROW_HEIGHT - 6

// ─── Visual encoding ───────────────────────────────────────────────

const CLASS_STYLE: Record<
  OperationalClass,
  { fill: string; stroke: string; text: string }
> = {
  field:    { fill: '#fbf7f2', stroke: '#eadccd', text: '#80644f' },
  load:     { fill: '#fff9ed', stroke: '#ecd8a4', text: '#8a6420' },
  dose:     { fill: '#f8fbfd', stroke: '#cfe5f1', text: '#356f93' },
  mediator: { fill: '#f7fbf7', stroke: '#cfe1d4', text: '#51705b' },
  target:   { fill: '#fbf7fb', stroke: '#e5d1e5', text: '#7a587a' },
  constant: { fill: '#f5f5f5', stroke: '#d4d4d4', text: '#525252' },
}

const TIER_COLOR: Record<EvidenceTier, string> = {
  member:     '#6366f1',
  cohort:     '#10b981',
  literature: '#a8a29e',
  mechanism:  '#d6d3d1',
}

const TIER_OPACITY: Record<EvidenceTier, number> = {
  member:     0.85,
  cohort:     0.65,
  literature: 0.45,
  mechanism:  0.35,
}

const COLUMN_LABEL = [
  'Context · Fields',
  'Exposures · Loads',
  'Actions · Doses',
  'Mediators',
  'Wearables',
  'Biomarkers',
]

const SYSTEM_LABEL: Record<PhysSystem, string> = {
  sleep: 'Sleep',
  autonomic: 'Autonomic',
  iron: 'Iron',
  lipids: 'Lipids',
  hormones: 'Hormones',
  inflammation: 'Inflammation',
  metabolic: 'Metabolic',
  body_comp: 'Body composition',
  cardio: 'Cardio fitness',
  renal: 'Renal',
  immune: 'Immune',
  training: 'Training',
  diet: 'Diet',
  supplements: 'Supplements',
  environment: 'Environment',
  other: 'Other',
}

const HEADER_PAD = 36
const VIEWBOX_PAD_X = 64
const VIEWBOX_PAD_Y = HEADER_PAD

const SCALE_MIN = 0.25
const SCALE_MAX = 2.5
const ZOOM_KEY_STEP = 1.2

type LODTier = 'bird' | 'fit' | 'detail'

interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

// ─── Component ─────────────────────────────────────────────────────

interface Props {
  participant: ParticipantPortal
}

export function DagCanvas({ participant }: Props) {
  const { nodes, edges } = useMemo(() => assembleDag(participant), [participant])
  const layout = useMemo(() => layoutDag(nodes, edges), [nodes, edges])

  // Member edges drawn last so they sit on top.
  const visualEdges = useMemo(() => {
    const causal = edges.filter((e) => e.kind === 'causal')
    return causal.sort((a, b) => tierZ(a.evidenceTier) - tierZ(b.evidenceTier))
  }, [edges])

  const memberCount = edges.filter((e) => e.fromMember).length
  const literatureCount = edges.filter((e) => e.fromLiterature && !e.fromMember).length
  const mechanismCount = edges.filter((e) => e.evidenceTier === 'mechanism').length

  const baseViewBox = useMemo<ViewBox>(
    () => ({
      x: -(NODE_WIDTH / 2) - VIEWBOX_PAD_X,
      y: -VIEWBOX_PAD_Y,
      w: layout.bbox.width + 2 * VIEWBOX_PAD_X + NODE_WIDTH / 2,
      h: layout.bbox.height + 2 * VIEWBOX_PAD_Y,
    }),
    [layout.bbox.width, layout.bbox.height],
  )

  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const viewBoxRef = useRef<ViewBox>(baseViewBox)
  const rafPendingRef = useRef(false)
  const dragRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)

  const [lodTier, setLodTier] = useState<LODTier>('fit')

  // Reset viewBox whenever participant changes (i.e. layout changed)
  useEffect(() => {
    viewBoxRef.current = baseViewBox
    applyViewBox()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseViewBox])

  // ─── Apply viewBox ────────────────────────────────────────────

  const applyViewBox = useCallback(() => {
    const svg = svgRef.current
    if (!svg) return
    const { x, y, w, h } = viewBoxRef.current
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)

    const containerW = containerRef.current?.clientWidth ?? w
    const effectiveScale = containerW / w
    const tier: LODTier =
      effectiveScale < 0.6 ? 'bird' : effectiveScale < 1.2 ? 'fit' : 'detail'
    setLodTier((prev) => (prev === tier ? prev : tier))
  }, [])

  const scheduleApply = useCallback(() => {
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    requestAnimationFrame(() => {
      rafPendingRef.current = false
      applyViewBox()
    })
  }, [applyViewBox])

  // Run once on mount (after svg ref attaches) to set initial viewBox.
  useLayoutEffect(() => {
    applyViewBox()
  }, [applyViewBox])

  // ─── Pan / zoom primitives ────────────────────────────────────

  const pan = useCallback(
    (dxScreen: number, dyScreen: number) => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const { w, h } = viewBoxRef.current
      const dxSvg = dxScreen * (w / rect.width)
      const dySvg = dyScreen * (h / rect.height)
      viewBoxRef.current = {
        ...viewBoxRef.current,
        x: viewBoxRef.current.x - dxSvg,
        y: viewBoxRef.current.y - dySvg,
      }
      scheduleApply()
    },
    [scheduleApply],
  )

  const zoomAt = useCallback(
    (factor: number, anchorClientX: number, anchorClientY: number) => {
      const svg = svgRef.current
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const vb = viewBoxRef.current

      // Anchor in svg coords
      const anchorSvgX = vb.x + ((anchorClientX - rect.left) * vb.w) / rect.width
      const anchorSvgY = vb.y + ((anchorClientY - rect.top) * vb.h) / rect.height

      const newW = vb.w / factor
      const newH = vb.h / factor

      // Clamp scale relative to base
      const baseW = baseViewBox.w
      const newScale = baseW / newW
      if (newScale < SCALE_MIN) {
        const clampW = baseW / SCALE_MIN
        const clampH = baseViewBox.h / SCALE_MIN
        viewBoxRef.current = {
          x: anchorSvgX - ((anchorClientX - rect.left) / rect.width) * clampW,
          y: anchorSvgY - ((anchorClientY - rect.top) / rect.height) * clampH,
          w: clampW,
          h: clampH,
        }
      } else if (newScale > SCALE_MAX) {
        const clampW = baseW / SCALE_MAX
        const clampH = baseViewBox.h / SCALE_MAX
        viewBoxRef.current = {
          x: anchorSvgX - ((anchorClientX - rect.left) / rect.width) * clampW,
          y: anchorSvgY - ((anchorClientY - rect.top) / rect.height) * clampH,
          w: clampW,
          h: clampH,
        }
      } else {
        viewBoxRef.current = {
          x: anchorSvgX - ((anchorClientX - rect.left) / rect.width) * newW,
          y: anchorSvgY - ((anchorClientY - rect.top) / rect.height) * newH,
          w: newW,
          h: newH,
        }
      }
      scheduleApply()
    },
    [baseViewBox, scheduleApply],
  )

  const zoomCentered = useCallback(
    (factor: number) => {
      const rect = svgRef.current?.getBoundingClientRect()
      if (!rect) return
      zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2)
    },
    [zoomAt],
  )

  const fitAll = useCallback(() => {
    viewBoxRef.current = baseViewBox
    scheduleApply()
  }, [baseViewBox, scheduleApply])

  // ─── Wheel listener (passive: false so we can preventDefault) ─

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        // Zoom toward cursor — deltaY < 0 = zoom in
        const factor = Math.pow(1.0015, -e.deltaY)
        zoomAt(factor, e.clientX, e.clientY)
      } else {
        // Pan
        pan(-e.deltaX, -e.deltaY)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [pan, zoomAt])

  // ─── Pointer drag (pan) ──────────────────────────────────────

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Only start drag for primary button on the bare canvas (not a node /
    // edge child element with its own handler).
    if (e.button !== 0) return
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.currentTarget.style.cursor = 'grabbing'
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const d = dragRef.current
      if (!d || d.pointerId !== e.pointerId) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      dragRef.current = { ...d, x: e.clientX, y: e.clientY }
      pan(dx, dy)
    },
    [pan],
  )

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    if (dragRef.current.pointerId !== e.pointerId) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    e.currentTarget.style.cursor = 'grab'
    dragRef.current = null
  }, [])

  // ─── Keyboard shortcuts ──────────────────────────────────────

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<SVGSVGElement>) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomCentered(ZOOM_KEY_STEP)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomCentered(1 / ZOOM_KEY_STEP)
      } else if (e.key === '0') {
        e.preventDefault()
        fitAll()
      }
    },
    [zoomCentered, fitAll],
  )

  // ─── Render-time LOD flags ───────────────────────────────────

  const showLabels = lodTier !== 'bird'
  const showArrowheads = lodTier === 'detail'
  const useThinEdges = lodTier === 'bird'

  return (
    <div className="space-y-3">
      <DagLegend
        memberCount={memberCount}
        literatureCount={literatureCount}
        mechanismCount={mechanismCount}
        nodeCount={nodes.length}
        edgeCount={visualEdges.length}
        lodTier={lodTier}
      />
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
        style={{ height: '78vh' }}
      >
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`${baseViewBox.x} ${baseViewBox.y} ${baseViewBox.w} ${baseViewBox.h}`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          style={{
            display: 'block',
            cursor: 'grab',
            outline: 'none',
            touchAction: 'none',
          }}
        >
          <defs>
            {(Object.entries(TIER_COLOR) as Array<[EvidenceTier, string]>).map(
              ([tier, color]) => (
                <marker
                  key={tier}
                  id={`dag-arrow-${tier}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
                </marker>
              ),
            )}
          </defs>

          {/* Column headers — keep visible at all LOD tiers */}
          {COLUMN_LABEL.map((label, i) => (
            <text
              key={i}
              x={COLUMN_X[i]}
              y={-14}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={TEXT_INK}
              style={{ pointerEvents: 'none' }}
            >
              {label}
            </text>
          ))}

          {/* System group separators — visible above bird tier */}
          {showLabels &&
            layout.groupSeparators.map((sep, i) => (
              <g key={`sep-${i}`} style={{ pointerEvents: 'none' }}>
                <line
                  x1={COLUMN_X[sep.column] - NODE_WIDTH / 2 - 4}
                  x2={COLUMN_X[sep.column] + NODE_WIDTH / 2 + 4}
                  y1={sep.yTop - 6}
                  y2={sep.yTop - 6}
                  stroke="#e7e5e4"
                  strokeDasharray="2 3"
                  strokeWidth={1}
                />
                <text
                  x={COLUMN_X[sep.column] - NODE_WIDTH / 2 - 8}
                  y={sep.yTop - 2}
                  textAnchor="end"
                  fontSize={9}
                  fill={TEXT_MUTED}
                  fontWeight={500}
                >
                  {SYSTEM_LABEL[sep.system] ?? sep.system}
                </text>
              </g>
            ))}

          {/* Edge layer */}
          <g>
            {visualEdges.map((e) => {
              const sp = layout.positions.get(e.source)
              const tp = layout.positions.get(e.target)
              if (!sp || !tp) return null
              return (
                <EdgePath
                  key={`${e.source}->${e.target}`}
                  edge={e}
                  sx={sp.x + NODE_WIDTH / 2}
                  sy={sp.y + ROW_HEIGHT / 2}
                  tx={tp.x - NODE_WIDTH / 2}
                  ty={tp.y + ROW_HEIGHT / 2}
                  thin={useThinEdges}
                  arrowhead={showArrowheads}
                />
              )
            })}
          </g>

          {/* Node layer */}
          <g>
            {nodes.map((node) => {
              const pos = layout.positions.get(node.id)
              if (!pos) return null
              return (
                <NodeRect
                  key={node.id}
                  node={node}
                  x={pos.x}
                  y={pos.y}
                  showLabel={showLabels}
                />
              )
            })}
          </g>
        </svg>

        <ZoomControls
          onZoomIn={() => zoomCentered(ZOOM_KEY_STEP)}
          onZoomOut={() => zoomCentered(1 / ZOOM_KEY_STEP)}
          onReset={fitAll}
        />
      </div>
    </div>
  )
}

// ─── Pieces ────────────────────────────────────────────────────────

function EdgePath({
  edge,
  sx,
  sy,
  tx,
  ty,
  thin,
  arrowhead,
}: {
  edge: DagEdge
  sx: number
  sy: number
  tx: number
  ty: number
  thin: boolean
  arrowhead: boolean
}) {
  const dx = tx - sx
  const offset = Math.max(40, dx / 2)
  const d = `M ${sx} ${sy} C ${sx + offset} ${sy}, ${tx - offset} ${ty}, ${tx} ${ty}`

  const color = TIER_COLOR[edge.evidenceTier]
  const opacity = thin ? 0.45 : TIER_OPACITY[edge.evidenceTier]
  const strokeWidth = thin ? 0.4 : 0.5 + Math.min(2.5, Math.abs(edge.effect) * 5)
  const strokeDasharray = thin
    ? undefined
    : edge.evidenceTier === 'mechanism'
      ? '4 3'
      : edge.beneficial === false
        ? '5 3'
        : undefined

  const titleParts = [
    `${edge.source} → ${edge.target}`,
    `d = ${edge.effect.toFixed(2)} (${edge.evidenceTier})`,
    `horizon: ${edge.horizon}`,
  ]
  if (edge.beneficial === true) titleParts.push('beneficial direction')
  else if (edge.beneficial === false) titleParts.push('harmful direction')
  if (edge.rationale) titleParts.push('', edge.rationale)

  return (
    <path
      d={d}
      stroke={color}
      strokeWidth={strokeWidth}
      fill="none"
      strokeDasharray={strokeDasharray}
      opacity={opacity}
      markerEnd={arrowhead ? `url(#dag-arrow-${edge.evidenceTier})` : undefined}
    >
      <title>{titleParts.join('\n')}</title>
    </path>
  )
}

function NodeRect({
  node,
  x,
  y,
  showLabel,
}: {
  node: DagNode
  x: number
  y: number
  showLabel: boolean
}) {
  const style = CLASS_STYLE[node.operationalClass]
  const left = x - NODE_WIDTH / 2
  return (
    <g>
      <rect
        x={left}
        y={y}
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={6}
        fill={style.fill}
        stroke={style.stroke}
        strokeWidth={node.caspianRelevant ? 1.5 : 1}
        strokeDasharray={node.caspianRelevant ? undefined : '3 2'}
      />
      {showLabel && (
        <text
          x={x}
          y={y + NODE_HEIGHT / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fontWeight={500}
          fill={style.text}
          style={{ pointerEvents: 'none' }}
        >
          {node.label}
        </text>
      )}
      <title>
        {`${node.label}\n${node.operationalClass} · ${SYSTEM_LABEL[node.system] ?? node.system}\nin ${node.inDegree} · out ${node.outDegree}${node.caspianRelevant ? '\nmember-relevant' : ''}`}
      </title>
    </g>
  )
}

function DagLegend({
  memberCount,
  literatureCount,
  mechanismCount,
  nodeCount,
  edgeCount,
  lodTier,
}: {
  memberCount: number
  literatureCount: number
  mechanismCount: number
  nodeCount: number
  edgeCount: number
  lodTier: LODTier
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-[11px] text-stone-600">
      <span className="font-semibold text-stone-800">
        {nodeCount} nodes · {edgeCount} edges
      </span>
      <span className="h-3 w-px bg-stone-200" />
      <LegendSwatch color={TIER_COLOR.member} label={`${memberCount} member`} />
      <LegendSwatch color={TIER_COLOR.literature} label={`${literatureCount} literature`} />
      <LegendSwatch color={TIER_COLOR.mechanism} label={`${mechanismCount} mechanism`} dashed />
      <span className="h-3 w-px bg-stone-200" />
      <span className="text-stone-500">
        Wheel to pan · ⌘/Ctrl-wheel to zoom · drag to pan · + / − / 0 keys
      </span>
      <span className="ml-auto text-[10px] uppercase tracking-wide text-stone-400">
        {lodTier === 'bird' ? "Bird's eye" : lodTier === 'fit' ? 'Fit' : 'Detail'}
      </span>
    </div>
  )
}

function LegendSwatch({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="20" height="6" aria-hidden>
        <line
          x1="0"
          x2="20"
          y1="3"
          y2="3"
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? '3 2' : undefined}
        />
      </svg>
      <span>{label}</span>
    </span>
  )
}

function ZoomControls({
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}) {
  return (
    <div
      className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm"
      style={{ pointerEvents: 'auto' }}
    >
      <button
        type="button"
        onClick={onZoomIn}
        className="flex h-8 w-8 items-center justify-center text-stone-600 hover:bg-stone-50"
        aria-label="Zoom in"
        title="Zoom in (+)"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className="flex h-8 w-8 items-center justify-center border-t border-stone-200 text-stone-600 hover:bg-stone-50"
        aria-label="Zoom out"
        title="Zoom out (−)"
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onReset}
        className="flex h-8 w-8 items-center justify-center border-t border-stone-200 text-stone-600 hover:bg-stone-50"
        aria-label="Fit all"
        title="Fit all (0)"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────

function tierZ(tier: EvidenceTier): number {
  switch (tier) {
    case 'mechanism':
      return 0
    case 'literature':
      return 1
    case 'cohort':
      return 2
    case 'member':
      return 3
  }
}

export default DagCanvas
