/**
 * Per-outcome clinical thresholds for recommendation gating.
 *
 * Mirror of `backend/serif_scm/clinical_thresholds.py`. That file is
 * authoritative; update it first, then run `npm run gen:thresholds`
 * (or hand-sync) to update this file.
 *
 * `minDetectable` is the single most important field: it enters
 * `P_meaningful_benefit = Φ((|effect| - minDetectable) / se)` in
 * `computeGatingScore` (src/data/scm/gating.ts).
 */

export type Direction = 'higher' | 'lower'
export type ThresholdSource = 'literature' | 'default_10pct'

export interface ClinicalThreshold {
  outcome: string
  direction: Direction
  /** Smallest change considered clinically meaningful (same units as outcome). */
  minDetectable: number
  clinicalLow: number
  clinicalHigh: number
  units: string
  source: ThresholdSource
}

const DEFAULT_DIRECTION: Direction = 'higher'

// Literature-anchored outcomes. Values provided by user (2026-04-17);
// sources: standard MCID references for cardiovascular + endocrine labs,
// HRV wearable validation studies, and clinical guideline thresholds.
const LITERATURE_ENTRIES: Array<[string, number]> = [
  ['hba1c',            0.3 ],
  ['hrv_daily',        6.0 ],
  ['hscrp',            1.0 ],
  ['apob',            10.0 ],
  ['vo2_peak',         2.0 ],
  ['ferritin',        10.0 ],
  ['testosterone',   100.0 ],
  ['glucose',         10.0 ],
  ['triglycerides',   20.0 ],
  ['cortisol',         3.0 ],
  ['deep_sleep',      20.0 ],
  ['sleep_efficiency', 5.0 ],
  ['resting_hr',       5.0 ],
  ['sleep_quality',    5.0 ],
]

// outcome → [typicalMean, clinicalLow, clinicalHigh, units]
const TYPICAL: Array<[string, number, number, number, string]> = [
  ['ferritin',             65.0,   30.0,  300.0,  'ng/mL'    ],
  ['iron_total',           90.0,   50.0,  175.0,  'mcg/dL'   ],
  ['hemoglobin',           14.2,   12.0,   17.5,  'g/dL'     ],
  ['rbc',                   4.8,    4.0,    5.9,  'M/uL'     ],
  ['mcv',                  88.0,   80.0,   96.0,  'fL'       ],
  ['rdw',                  13.0,   11.5,   14.5,  '%'        ],
  ['wbc',                   6.5,    4.0,   11.0,  'K/uL'     ],
  ['platelets',           250.0,  150.0,  400.0,  'K/uL'     ],
  ['nlr',                   1.8,    1.0,    3.0,  'ratio'    ],
  ['testosterone',        500.0,  300.0,  900.0,  'ng/dL'    ],
  ['cortisol',             12.0,    5.0,   23.0,  'mcg/dL'   ],
  ['estradiol',            30.0,   10.0,   60.0,  'pg/mL'    ],
  ['dhea_s',              300.0,  140.0,  520.0,  'mcg/dL'   ],
  ['shbg',                 40.0,   20.0,   75.0,  'nmol/L'   ],
  ['triglycerides',       130.0,   40.0,  150.0,  'mg/dL'    ],
  ['hdl',                  55.0,   40.0,   80.0,  'mg/dL'    ],
  ['ldl',                 115.0,   50.0,  130.0,  'mg/dL'    ],
  ['total_cholesterol',   195.0,  125.0,  200.0,  'mg/dL'    ],
  ['non_hdl_cholesterol', 140.0,   60.0,  160.0,  'mg/dL'    ],
  ['apob',                 95.0,   40.0,  100.0,  'mg/dL'    ],
  ['hscrp',                 1.5,    0.1,    3.0,  'mg/L'     ],
  ['glucose',              92.0,   70.0,   99.0,  'mg/dL'    ],
  ['insulin',               8.0,    2.0,   15.0,  'uIU/mL'   ],
  ['hba1c',                 5.3,    4.2,    5.6,  '%'        ],
  ['uric_acid',             5.5,    3.5,    7.2,  'mg/dL'    ],
  ['zinc',                 85.0,   70.0,  120.0,  'mcg/dL'   ],
  ['magnesium_rbc',         5.0,    4.2,    6.8,  'mg/dL'    ],
  ['homocysteine',          9.0,    4.0,   15.0,  'umol/L'   ],
  ['omega3_index',          4.5,    4.0,    8.0,  '%'        ],
  ['b12',                 500.0,  200.0, 1100.0,  'pg/mL'    ],
  ['folate',               12.0,    3.5,   20.0,  'ng/mL'    ],
  ['ast',                  24.0,   10.0,   40.0,  'U/L'      ],
  ['alt',                  22.0,    7.0,   40.0,  'U/L'      ],
  ['creatinine',            1.0,    0.6,    1.3,  'mg/dL'    ],
  ['albumin',               4.3,    3.5,    5.0,  'g/dL'     ],
  ['vo2_peak',             42.0,   25.0,   70.0,  'ml/min/kg'],
  ['body_fat_pct',         22.0,   10.0,   30.0,  '%'        ],
  ['body_mass_kg',         75.0,   50.0,  110.0,  'kg'       ],
  ['hrv_daily',            50.0,   25.0,   85.0,  'ms'       ],
  ['resting_hr',           62.0,   45.0,   75.0,  'bpm'      ],
  ['sleep_efficiency',     87.0,   80.0,   99.0,  '%'        ],
  ['sleep_quality',        70.0,   40.0,  100.0,  'score'    ],
  ['deep_sleep',           80.0,   40.0,  130.0,  'min'      ],
  ['sleep_debt',            2.0,    0.0,    5.0,  'hours'    ],
  // Regime states: typical=0.5 (midpoint of activation range) so min_detectable
  // resolves to 0.1 * 0.5 = 0.05. Typical=0 would collapse min_detectable to 0
  // and let tiny numerical residuals trigger "recommended".
  ['overreaching_state',      0.5,  0.0,   0.5,   'activation'],
  ['iron_deficiency_state',   0.5,  0.0,   0.5,   'activation'],
  ['sleep_deprivation_state', 0.5,  0.0,   0.5,   'activation'],
  ['inflammation_state',      0.5,  0.0,   0.5,   'activation'],
]

const DIRECTION_MAP: Record<string, Direction> = {
  // Lower is better
  cortisol: 'lower', glucose: 'lower', insulin: 'lower',
  hscrp: 'lower', triglycerides: 'lower', ldl: 'lower',
  apob: 'lower', non_hdl_cholesterol: 'lower',
  total_cholesterol: 'lower', uric_acid: 'lower',
  homocysteine: 'lower', resting_hr: 'lower',
  body_fat_pct: 'lower', nlr: 'lower',
  ast: 'lower', alt: 'lower', rdw: 'lower',
  hba1c: 'lower', sleep_debt: 'lower',
  overreaching_state: 'lower', iron_deficiency_state: 'lower',
  sleep_deprivation_state: 'lower', inflammation_state: 'lower',
  // Higher is better
  hdl: 'higher', hrv_daily: 'higher', sleep_quality: 'higher',
  sleep_efficiency: 'higher', deep_sleep: 'higher',
  vo2_peak: 'higher', ferritin: 'higher', hemoglobin: 'higher',
  testosterone: 'higher', albumin: 'higher', rbc: 'higher',
  zinc: 'higher', magnesium_rbc: 'higher', iron_total: 'higher',
  omega3_index: 'higher', b12: 'higher', folate: 'higher',
  dhea_s: 'higher',
}

const LITERATURE = new Map(LITERATURE_ENTRIES)

function buildRegistry(): Map<string, ClinicalThreshold> {
  const reg = new Map<string, ClinicalThreshold>()
  for (const [outcome, typical, low, high, units] of TYPICAL) {
    const lit = LITERATURE.get(outcome)
    const minDetectable = lit ?? 0.1 * typical
    reg.set(outcome, {
      outcome,
      direction: DIRECTION_MAP[outcome] ?? DEFAULT_DIRECTION,
      minDetectable: Math.round(minDetectable * 10000) / 10000,
      clinicalLow: low,
      clinicalHigh: high,
      units,
      source: lit !== undefined ? 'literature' : 'default_10pct',
    })
  }
  return reg
}

export const CLINICAL_THRESHOLDS: Map<string, ClinicalThreshold> = buildRegistry()

export function getThreshold(outcome: string): ClinicalThreshold | undefined {
  return CLINICAL_THRESHOLDS.get(outcome)
}

export function minDetectable(outcome: string, fallback = 0): number {
  return CLINICAL_THRESHOLDS.get(outcome)?.minDetectable ?? fallback
}

export function directionFor(outcome: string): Direction {
  return CLINICAL_THRESHOLDS.get(outcome)?.direction ?? DEFAULT_DIRECTION
}

export function isBeneficial(outcome: string, effect: number): boolean {
  const d = directionFor(outcome)
  if (d === 'lower') return effect < -1e-10
  return effect > 1e-10
}
