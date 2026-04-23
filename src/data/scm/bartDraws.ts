/**
 * BART posterior-draw types + loader for the Twin MC engine.
 *
 * Each outcome node with a BART surface ships as a compact JSON written
 * by `backend/serif_scm/export_bart_json.py`. The schema mirrors the
 * Python `BartPosteriorDraws.to_json_compact()` payload — see
 * `backend/serif_scm/bart_fit.py` for canonical shape.
 *
 * Consumers: bartInterpolator (parent-vector lookup) and bartMonteCarlo
 * (per-draw abduction + propagation). The JSON loader here is the single
 * entry point — no other module should fetch BART JSON directly.
 */

// ─── JSON wire format ──────────────────────────────────────────────

/** Raw JSON payload shape — matches Python `to_json_compact()`. */
export interface BartDrawsJson {
  outcome: string
  parent_names: string[]
  /** Flattened G*P grid, row-major. Float32-rounded to 3 dp. */
  parent_grid: number[][]
  /** K*G matrix of posterior draws, row-major. Float32-rounded to 2 dp. */
  predictions: number[][]
  /** K per-draw observation SDs. */
  sigma: number[]
  /** Intercept absorbed at fit time. */
  data_mean: number
  n_training: number
  n_trees: number
  n_draws_effective: number
}

/** Bundle manifest written by `export_bart_json.py`. */
export interface BartBundleManifest {
  [outcome: string]: {
    path: string
    parent_names: string[]
    n_parents: number
    n_grid: number
    n_draws: number
    n_training: number
    n_trees: number
    data_mean: number
    size_bytes: number
  }
}

// ─── In-memory representation ──────────────────────────────────────

/**
 * Decoded + indexed BART draws, ready for MC propagation.
 *
 * Uses typed arrays (Float32Array) for the hot data — ~4 MB per outcome
 * fits in L2 cache and interpolator lookup is tight-loop friendly.
 */
export interface BartDraws {
  outcome: string
  parentNames: string[]
  nParents: number
  nGrid: number
  nDraws: number
  /** Flattened G*P, row-major: grid[g*P + p]. */
  grid: Float32Array
  /** Flattened K*G, row-major: predictions[k*G + g]. */
  predictions: Float32Array
  /** Per-draw sigma, length K. */
  sigma: Float32Array
  dataMean: number
  nTraining: number
  nTrees: number
  /** Per-parent min across the grid (used by the interpolator). */
  parentMin: Float32Array
  /** Per-parent range (max-min). 1 where max==min to avoid div-by-zero. */
  parentRange: Float32Array
}

function computeParentNormalization(
  grid: Float32Array,
  nGrid: number,
  nParents: number
): { parentMin: Float32Array; parentRange: Float32Array } {
  const parentMin = new Float32Array(nParents).fill(Infinity)
  const parentMax = new Float32Array(nParents).fill(-Infinity)

  for (let g = 0; g < nGrid; g++) {
    const base = g * nParents
    for (let p = 0; p < nParents; p++) {
      const v = grid[base + p]
      if (v < parentMin[p]) parentMin[p] = v
      if (v > parentMax[p]) parentMax[p] = v
    }
  }

  const parentRange = new Float32Array(nParents)
  for (let p = 0; p < nParents; p++) {
    const r = parentMax[p] - parentMin[p]
    parentRange[p] = r > 0 ? r : 1
  }

  return { parentMin, parentRange }
}

/** Convert wire-format JSON into the typed-array in-memory shape. */
export function decodeBartDraws(json: BartDrawsJson): BartDraws {
  const parentNames = json.parent_names
  const nParents = parentNames.length
  const nGrid = json.parent_grid.length
  const nDraws = json.predictions.length

  // Flatten G*P and K*G into contiguous Float32Arrays.
  const grid = new Float32Array(nGrid * nParents)
  for (let g = 0; g < nGrid; g++) {
    const row = json.parent_grid[g]
    const base = g * nParents
    for (let p = 0; p < nParents; p++) grid[base + p] = row[p]
  }

  const predictions = new Float32Array(nDraws * nGrid)
  for (let k = 0; k < nDraws; k++) {
    const row = json.predictions[k]
    const base = k * nGrid
    for (let g = 0; g < nGrid; g++) predictions[base + g] = row[g]
  }

  const sigma = Float32Array.from(json.sigma)

  const { parentMin, parentRange } = computeParentNormalization(grid, nGrid, nParents)

  return {
    outcome: json.outcome,
    parentNames,
    nParents,
    nGrid,
    nDraws,
    grid,
    predictions,
    sigma,
    dataMean: json.data_mean,
    nTraining: json.n_training,
    nTrees: json.n_trees,
    parentMin,
    parentRange,
  }
}

// ─── Async loader with memoization ─────────────────────────────────

// Relative to the Serif demo build; the bundle lives in public/data/bartDraws/
// and Vite serves it at ${BASE_URL}data/bartDraws/*.json. We use fetch so
// draws can be lazy-loaded per Twin interaction rather than bundled into
// the initial JS payload (each outcome is ~4 MB uncompressed).
//
// import.meta.env.BASE_URL is injected by Vite at build time and ends with
// a trailing slash — '/' for root deploys, '/serif/' for the GitHub Pages
// project-page subpath. Prefixing with it (instead of using a relative path)
// keeps fetches correct regardless of the current SPA route.
//
// In a Node test runner (tsx) `import.meta.env` is undefined; fall back to
// '/data/bartDraws' so the module loads. Tests typically call
// `setBartDrawsBasePath` to redirect to a disk path anyway.
const DEFAULT_BASE_PATH =
  typeof import.meta.env !== 'undefined' && import.meta.env?.BASE_URL
    ? `${import.meta.env.BASE_URL}data/bartDraws`
    : '/data/bartDraws'

const drawsCache = new Map<string, Promise<BartDraws>>()
let manifestCache: Promise<BartBundleManifest> | null = null

/** Resolve the base URL path. Overridable for tests / alternative hosts. */
let basePath: string = DEFAULT_BASE_PATH

export function setBartDrawsBasePath(path: string): void {
  basePath = path.replace(/\/$/, '')
  // invalidate caches when base path changes (typically only set in tests)
  drawsCache.clear()
  manifestCache = null
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(
      `Failed to load ${url}: ${response.status} ${response.statusText}`
    )
  }
  return response.json()
}

/** Load the bundle manifest — cached after first fetch. */
export function loadBartManifest(): Promise<BartBundleManifest> {
  if (!manifestCache) {
    manifestCache = fetchJson<BartBundleManifest>(`${basePath}/manifest.json`)
  }
  return manifestCache
}

/**
 * Load BART draws for one outcome — returns null if the outcome has no
 * BART fit. The caller is responsible for falling back to piecewise.
 *
 * Memoized so a single Twin interaction that hits the same node twice
 * doesn't re-parse 4 MB of JSON.
 */
export async function loadBartDraws(outcome: string): Promise<BartDraws | null> {
  const manifest = await loadBartManifest()
  if (!(outcome in manifest)) return null

  if (!drawsCache.has(outcome)) {
    const path = manifest[outcome].path
    drawsCache.set(
      outcome,
      fetchJson<BartDrawsJson>(`${basePath}/${path}`).then(decodeBartDraws)
    )
  }
  return drawsCache.get(outcome)!
}

/** Preload draws for a list of outcomes concurrently. */
export async function preloadBartDraws(
  outcomes: string[]
): Promise<Map<string, BartDraws>> {
  const results = await Promise.all(
    outcomes.map(async (o) => [o, await loadBartDraws(o)] as const)
  )
  const map = new Map<string, BartDraws>()
  for (const [o, draws] of results) {
    if (draws) map.set(o, draws)
  }
  return map
}

/** Test helper: clear all caches. */
export function _resetBartCache(): void {
  drawsCache.clear()
  manifestCache = null
}
