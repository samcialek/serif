// FHIR Observation Resources (Lab Results & Vitals) for all Personas
// Realistic lab values with trends aligned to each persona's health story

import {
  FhirObservation,
  CODE_SYSTEMS,
  LOINC_CODES,
  INTERPRETATION_CODES,
  createCodeableConcept,
  createReference,
  createQuantity,
} from '../../types/fhir';

// ============================================================================
// Helper to create observation
// ============================================================================

function createLabObservation(
  id: string,
  personaId: string,
  personaName: string,
  loincCode: { code: string; display: string },
  value: number,
  unit: string,
  date: string,
  interpretation: keyof typeof INTERPRETATION_CODES,
  refLow?: number,
  refHigh?: number,
  source: FhirObservation['_serifSource'] = 'Quest',
  trend?: FhirObservation['_serifTrend'],
  linkedInsights?: string[]
): FhirObservation {
  const obs: FhirObservation = {
    resourceType: 'Observation',
    id,
    meta: {
      lastUpdated: `${date}T12:00:00Z`,
      source,
    },
    status: 'final',
    category: [
      createCodeableConcept(
        CODE_SYSTEMS.OBSERVATION_CATEGORY,
        'laboratory',
        'Laboratory'
      ),
    ],
    code: createCodeableConcept(CODE_SYSTEMS.LOINC, loincCode.code, loincCode.display),
    subject: createReference('Patient', personaId, personaName),
    effectiveDateTime: `${date}T08:00:00Z`,
    issued: `${date}T12:00:00Z`,
    valueQuantity: createQuantity(value, unit),
    interpretation: [
      createCodeableConcept(
        'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
        INTERPRETATION_CODES[interpretation].code,
        INTERPRETATION_CODES[interpretation].display
      ),
    ],
    _serifSource: source,
  };

  if (refLow !== undefined || refHigh !== undefined) {
    obs.referenceRange = [
      {
        low: refLow !== undefined ? createQuantity(refLow, unit) : undefined,
        high: refHigh !== undefined ? createQuantity(refHigh, unit) : undefined,
      },
    ];
  }

  if (trend) {
    obs._serifTrend = trend;
  }

  if (linkedInsights && linkedInsights.length > 0) {
    obs._serifLinkedInsights = linkedInsights;
  }

  return obs;
}

// ============================================================================
// RAJAN - Lab Results (showing glucose trending up with poor sleep)
// ============================================================================

export const rajanObservations: FhirObservation[] = [
  // Glucose - trending up (3 draws)
  createLabObservation(
    'rajan-obs-glucose-2024-04',
    'rajan',
    'Rajan P.',
    LOINC_CODES.GLUCOSE_FASTING,
    98,
    'mg/dL',
    '2024-04-15',
    'NORMAL',
    70,
    100,
    'Quest',
    'stable'
  ),
  createLabObservation(
    'rajan-obs-glucose-2024-08',
    'rajan',
    'Rajan P.',
    LOINC_CODES.GLUCOSE_FASTING,
    101,
    'mg/dL',
    '2024-08-20',
    'HIGH',
    70,
    100,
    'Quest',
    'declining',
    ['rajan-insight-sleep-glucose']
  ),
  createLabObservation(
    'rajan-obs-glucose-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.GLUCOSE_FASTING,
    104,
    'mg/dL',
    '2024-12-10',
    'HIGH',
    70,
    100,
    'Quest',
    'declining',
    ['rajan-insight-sleep-glucose', 'rajan-insight-eating-window']
  ),

  // HbA1c - showing prediabetic range
  createLabObservation(
    'rajan-obs-hba1c-2024-04',
    'rajan',
    'Rajan P.',
    LOINC_CODES.HBA1C,
    5.6,
    '%',
    '2024-04-15',
    'NORMAL',
    4.0,
    5.7,
    'Quest',
    'stable'
  ),
  createLabObservation(
    'rajan-obs-hba1c-2024-08',
    'rajan',
    'Rajan P.',
    LOINC_CODES.HBA1C,
    5.8,
    '%',
    '2024-08-20',
    'BORDERLINE',
    4.0,
    5.7,
    'Quest',
    'declining'
  ),
  createLabObservation(
    'rajan-obs-hba1c-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.HBA1C,
    5.9,
    '%',
    '2024-12-10',
    'BORDERLINE',
    4.0,
    5.7,
    'Quest',
    'declining',
    ['rajan-insight-sleep-glucose']
  ),

  // Lipid Panel - borderline
  createLabObservation(
    'rajan-obs-chol-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.CHOLESTEROL_TOTAL,
    208,
    'mg/dL',
    '2024-12-10',
    'BORDERLINE',
    0,
    200,
    'Quest'
  ),
  createLabObservation(
    'rajan-obs-ldl-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.LDL,
    128,
    'mg/dL',
    '2024-12-10',
    'BORDERLINE',
    0,
    100,
    'Quest'
  ),
  createLabObservation(
    'rajan-obs-hdl-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.HDL,
    48,
    'mg/dL',
    '2024-12-10',
    'LOW',
    40,
    60,
    'Quest'
  ),
  createLabObservation(
    'rajan-obs-trig-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.TRIGLYCERIDES,
    162,
    'mg/dL',
    '2024-12-10',
    'BORDERLINE',
    0,
    150,
    'Quest'
  ),

  // Vitamin D - low
  createLabObservation(
    'rajan-obs-vitd-2024-04',
    'rajan',
    'Rajan P.',
    LOINC_CODES.VITAMIN_D,
    22,
    'ng/mL',
    '2024-04-15',
    'LOW',
    30,
    100,
    'Quest'
  ),
  createLabObservation(
    'rajan-obs-vitd-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.VITAMIN_D,
    34,
    'ng/mL',
    '2024-12-10',
    'NORMAL',
    30,
    100,
    'Quest',
    'improving'
  ),

  // CRP - slightly elevated with stress
  createLabObservation(
    'rajan-obs-crp-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.CRP_HS,
    2.4,
    'mg/L',
    '2024-12-10',
    'BORDERLINE',
    0,
    1.0,
    'Quest',
    undefined,
    ['rajan-insight-hrv-stress']
  ),

  // Liver enzymes - normal
  createLabObservation(
    'rajan-obs-alt-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.ALT,
    32,
    'U/L',
    '2024-12-10',
    'NORMAL',
    7,
    56,
    'Quest'
  ),

  // Kidney - normal
  createLabObservation(
    'rajan-obs-creat-2024-12',
    'rajan',
    'Rajan P.',
    LOINC_CODES.CREATININE,
    1.0,
    'mg/dL',
    '2024-12-10',
    'NORMAL',
    0.7,
    1.3,
    'Quest'
  ),
];

// ============================================================================
// SARAH - Lab Results (showing metabolic improvement over time)
// ============================================================================

export const sarahObservations: FhirObservation[] = [
  // Glucose - improving dramatically
  createLabObservation(
    'sarah-obs-glucose-2024-03',
    'sarah',
    'Sarah M.',
    LOINC_CODES.GLUCOSE_FASTING,
    118,
    'mg/dL',
    '2024-03-01',
    'HIGH',
    70,
    100,
    'Quest',
    'stable'
  ),
  createLabObservation(
    'sarah-obs-glucose-2024-06',
    'sarah',
    'Sarah M.',
    LOINC_CODES.GLUCOSE_FASTING,
    108,
    'mg/dL',
    '2024-06-15',
    'HIGH',
    70,
    100,
    'Quest',
    'improving',
    ['sarah-insight-eating-window']
  ),
  createLabObservation(
    'sarah-obs-glucose-2024-09',
    'sarah',
    'Sarah M.',
    LOINC_CODES.GLUCOSE_FASTING,
    98,
    'mg/dL',
    '2024-09-20',
    'NORMAL',
    70,
    100,
    'Quest',
    'improving',
    ['sarah-insight-eating-window', 'sarah-insight-glucose-sleep']
  ),
  createLabObservation(
    'sarah-obs-glucose-2024-12',
    'sarah',
    'Sarah M.',
    LOINC_CODES.GLUCOSE_FASTING,
    94,
    'mg/dL',
    '2024-12-05',
    'NORMAL',
    70,
    100,
    'Quest',
    'improving',
    ['sarah-insight-eating-window', 'sarah-insight-glucose-sleep']
  ),

  // HbA1c - remarkable improvement
  createLabObservation(
    'sarah-obs-hba1c-2024-03',
    'sarah',
    'Sarah M.',
    LOINC_CODES.HBA1C,
    6.8,
    '%',
    '2024-03-01',
    'HIGH',
    4.0,
    5.7,
    'Quest'
  ),
  createLabObservation(
    'sarah-obs-hba1c-2024-06',
    'sarah',
    'Sarah M.',
    LOINC_CODES.HBA1C,
    6.5,
    '%',
    '2024-06-15',
    'HIGH',
    4.0,
    5.7,
    'Quest',
    'improving'
  ),
  createLabObservation(
    'sarah-obs-hba1c-2024-09',
    'sarah',
    'Sarah M.',
    LOINC_CODES.HBA1C,
    6.3,
    '%',
    '2024-09-20',
    'BORDERLINE',
    4.0,
    5.7,
    'Quest',
    'improving'
  ),
  createLabObservation(
    'sarah-obs-hba1c-2024-12',
    'sarah',
    'Sarah M.',
    LOINC_CODES.HBA1C,
    6.2,
    '%',
    '2024-12-05',
    'BORDERLINE',
    4.0,
    5.7,
    'Quest',
    'improving',
    ['sarah-insight-eating-window']
  ),

  // Lipids - improving
  createLabObservation(
    'sarah-obs-chol-2024-03',
    'sarah',
    'Sarah M.',
    LOINC_CODES.CHOLESTEROL_TOTAL,
    232,
    'mg/dL',
    '2024-03-01',
    'HIGH',
    0,
    200,
    'Quest'
  ),
  createLabObservation(
    'sarah-obs-chol-2024-12',
    'sarah',
    'Sarah M.',
    LOINC_CODES.CHOLESTEROL_TOTAL,
    195,
    'mg/dL',
    '2024-12-05',
    'NORMAL',
    0,
    200,
    'Quest',
    'improving'
  ),
  createLabObservation(
    'sarah-obs-ldl-2024-03',
    'sarah',
    'Sarah M.',
    LOINC_CODES.LDL,
    142,
    'mg/dL',
    '2024-03-01',
    'HIGH',
    0,
    100,
    'Quest'
  ),
  createLabObservation(
    'sarah-obs-ldl-2024-12',
    'sarah',
    'Sarah M.',
    LOINC_CODES.LDL,
    108,
    'mg/dL',
    '2024-12-05',
    'BORDERLINE',
    0,
    100,
    'Quest',
    'improving'
  ),
  createLabObservation(
    'sarah-obs-hdl-2024-12',
    'sarah',
    'Sarah M.',
    LOINC_CODES.HDL,
    58,
    'mg/dL',
    '2024-12-05',
    'NORMAL',
    40,
    60,
    'Quest',
    'improving'
  ),
  createLabObservation(
    'sarah-obs-trig-2024-03',
    'sarah',
    'Sarah M.',
    LOINC_CODES.TRIGLYCERIDES,
    198,
    'mg/dL',
    '2024-03-01',
    'HIGH',
    0,
    150,
    'Quest'
  ),
  createLabObservation(
    'sarah-obs-trig-2024-12',
    'sarah',
    'Sarah M.',
    LOINC_CODES.TRIGLYCERIDES,
    128,
    'mg/dL',
    '2024-12-05',
    'NORMAL',
    0,
    150,
    'Quest',
    'improving',
    ['sarah-insight-eating-window']
  ),

  // Liver - improving (fatty liver resolving)
  createLabObservation(
    'sarah-obs-alt-2024-03',
    'sarah',
    'Sarah M.',
    LOINC_CODES.ALT,
    52,
    'U/L',
    '2024-03-01',
    'BORDERLINE',
    7,
    56,
    'Quest'
  ),
  createLabObservation(
    'sarah-obs-alt-2024-12',
    'sarah',
    'Sarah M.',
    LOINC_CODES.ALT,
    28,
    'U/L',
    '2024-12-05',
    'NORMAL',
    7,
    56,
    'Quest',
    'improving'
  ),

  // CRP - normalized
  createLabObservation(
    'sarah-obs-crp-2024-03',
    'sarah',
    'Sarah M.',
    LOINC_CODES.CRP_HS,
    3.8,
    'mg/L',
    '2024-03-01',
    'HIGH',
    0,
    1.0,
    'Quest'
  ),
  createLabObservation(
    'sarah-obs-crp-2024-12',
    'sarah',
    'Sarah M.',
    LOINC_CODES.CRP_HS,
    0.8,
    'mg/L',
    '2024-12-05',
    'NORMAL',
    0,
    1.0,
    'Quest',
    'improving'
  ),
];

// ============================================================================
// MARCUS - Lab Results (inflammation focus, good otherwise)
// ============================================================================

export const marcusObservations: FhirObservation[] = [
  // Glucose - normal
  createLabObservation(
    'marcus-obs-glucose-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.GLUCOSE_FASTING,
    92,
    'mg/dL',
    '2024-10-15',
    'NORMAL',
    70,
    100,
    'Quest'
  ),

  // HbA1c - normal
  createLabObservation(
    'marcus-obs-hba1c-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.HBA1C,
    5.4,
    '%',
    '2024-10-15',
    'NORMAL',
    4.0,
    5.7,
    'Quest'
  ),

  // CRP - chronically elevated (key for Marcus)
  createLabObservation(
    'marcus-obs-crp-2024-06',
    'marcus',
    'Marcus J.',
    LOINC_CODES.CRP_HS,
    4.8,
    'mg/L',
    '2024-06-01',
    'HIGH',
    0,
    1.0,
    'Quest',
    'stable',
    ['marcus-insight-inflammation']
  ),
  createLabObservation(
    'marcus-obs-crp-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.CRP_HS,
    3.2,
    'mg/L',
    '2024-10-15',
    'HIGH',
    0,
    1.0,
    'Quest',
    'improving',
    ['marcus-insight-inflammation', 'marcus-insight-alcohol-crp']
  ),

  // ESR - elevated
  createLabObservation(
    'marcus-obs-esr-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.ESR,
    18,
    'mm/hr',
    '2024-10-15',
    'BORDERLINE',
    0,
    15,
    'Quest',
    undefined,
    ['marcus-insight-inflammation']
  ),

  // Lipids - good (athlete)
  createLabObservation(
    'marcus-obs-chol-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.CHOLESTEROL_TOTAL,
    178,
    'mg/dL',
    '2024-10-15',
    'NORMAL',
    0,
    200,
    'Quest'
  ),
  createLabObservation(
    'marcus-obs-ldl-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.LDL,
    98,
    'mg/dL',
    '2024-10-15',
    'NORMAL',
    0,
    100,
    'Quest'
  ),
  createLabObservation(
    'marcus-obs-hdl-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.HDL,
    62,
    'mg/dL',
    '2024-10-15',
    'NORMAL',
    40,
    60,
    'Quest'
  ),
  createLabObservation(
    'marcus-obs-trig-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.TRIGLYCERIDES,
    88,
    'mg/dL',
    '2024-10-15',
    'NORMAL',
    0,
    150,
    'Quest'
  ),

  // Testosterone - good for age
  createLabObservation(
    'marcus-obs-test-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.TESTOSTERONE,
    548,
    'ng/dL',
    '2024-10-15',
    'NORMAL',
    300,
    1000,
    'Quest'
  ),

  // Vitamin D - good (supplementing)
  createLabObservation(
    'marcus-obs-vitd-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.VITAMIN_D,
    52,
    'ng/mL',
    '2024-10-15',
    'NORMAL',
    30,
    100,
    'Quest'
  ),

  // Kidney - normal
  createLabObservation(
    'marcus-obs-creat-2024-10',
    'marcus',
    'Marcus J.',
    LOINC_CODES.CREATININE,
    1.1,
    'mg/dL',
    '2024-10-15',
    'NORMAL',
    0.7,
    1.3,
    'Quest'
  ),
];

// ============================================================================
// EMMA - Lab Results (limited, mostly normal, low vitamin D)
// ============================================================================

export const emmaObservations: FhirObservation[] = [
  // Basic metabolic - normal
  createLabObservation(
    'emma-obs-glucose-2024-11',
    'emma',
    'Emma L.',
    LOINC_CODES.GLUCOSE_FASTING,
    86,
    'mg/dL',
    '2024-11-01',
    'NORMAL',
    70,
    100,
    'Quest'
  ),

  // Thyroid - normal (ruled out for fatigue)
  createLabObservation(
    'emma-obs-tsh-2024-11',
    'emma',
    'Emma L.',
    LOINC_CODES.TSH,
    2.1,
    'mIU/L',
    '2024-11-01',
    'NORMAL',
    0.4,
    4.0,
    'Quest'
  ),

  // Vitamin D - low (contributing to fatigue)
  createLabObservation(
    'emma-obs-vitd-2024-11',
    'emma',
    'Emma L.',
    LOINC_CODES.VITAMIN_D,
    18,
    'ng/mL',
    '2024-11-01',
    'LOW',
    30,
    100,
    'Quest',
    undefined,
    ['emma-insight-fatigue']
  ),

  // Iron panel - normal
  createLabObservation(
    'emma-obs-hgb-2024-11',
    'emma',
    'Emma L.',
    LOINC_CODES.HEMOGLOBIN,
    13.2,
    'g/dL',
    '2024-11-01',
    'NORMAL',
    12.0,
    16.0,
    'Quest'
  ),

  // B12 - normal
  createLabObservation(
    'emma-obs-b12-2024-11',
    'emma',
    'Emma L.',
    LOINC_CODES.B12,
    485,
    'pg/mL',
    '2024-11-01',
    'NORMAL',
    200,
    900,
    'Quest'
  ),

  // Lipids - normal (young, healthy)
  createLabObservation(
    'emma-obs-chol-2024-11',
    'emma',
    'Emma L.',
    LOINC_CODES.CHOLESTEROL_TOTAL,
    172,
    'mg/dL',
    '2024-11-01',
    'NORMAL',
    0,
    200,
    'Quest'
  ),
  createLabObservation(
    'emma-obs-ldl-2024-11',
    'emma',
    'Emma L.',
    LOINC_CODES.LDL,
    92,
    'mg/dL',
    '2024-11-01',
    'NORMAL',
    0,
    100,
    'Quest'
  ),
];

// ============================================================================
// Export all observations
// ============================================================================

export const allObservations: FhirObservation[] = [
  ...rajanObservations,
  ...sarahObservations,
  ...marcusObservations,
  ...emmaObservations,
];

export function getObservationsForPersona(personaId: string): FhirObservation[] {
  switch (personaId) {
    case 'rajan':
      return rajanObservations;
    case 'sarah':
      return sarahObservations;
    case 'marcus':
      return marcusObservations;
    case 'emma':
      return emmaObservations;
    default:
      return [];
  }
}

export function getObservationById(id: string): FhirObservation | undefined {
  return allObservations.find((o) => o.id === id);
}

export function getObservationsByCode(
  personaId: string,
  loincCode: string
): FhirObservation[] {
  return getObservationsForPersona(personaId).filter(
    (o) => o.code.coding[0].code === loincCode
  );
}

export function getLatestObservation(
  personaId: string,
  loincCode: string
): FhirObservation | undefined {
  const observations = getObservationsByCode(personaId, loincCode);
  if (observations.length === 0) return undefined;
  return observations.sort(
    (a, b) =>
      new Date(b.effectiveDateTime).getTime() -
      new Date(a.effectiveDateTime).getTime()
  )[0];
}

export function getLabTrend(
  personaId: string,
  loincCode: string
): { values: number[]; dates: string[]; trend: 'improving' | 'stable' | 'declining' } | undefined {
  const observations = getObservationsByCode(personaId, loincCode).sort(
    (a, b) =>
      new Date(a.effectiveDateTime).getTime() -
      new Date(b.effectiveDateTime).getTime()
  );

  if (observations.length < 2) return undefined;

  const values = observations.map((o) => o.valueQuantity?.value || 0);
  const dates = observations.map((o) => o.effectiveDateTime.split('T')[0]);

  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const change = lastValue - firstValue;
  const percentChange = (change / firstValue) * 100;

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (Math.abs(percentChange) > 5) {
    // For most labs, lower is better, but need to handle HDL differently
    const lowerIsBetter = loincCode !== LOINC_CODES.HDL.code;
    trend = lowerIsBetter
      ? change < 0
        ? 'improving'
        : 'declining'
      : change > 0
      ? 'improving'
      : 'declining';
  }

  return { values, dates, trend };
}
