// FHIR Condition Resources for all Personas
// Realistic diagnoses aligned with each persona's health story

import {
  FhirCondition,
  CODE_SYSTEMS,
  ICD10_CODES,
  createCodeableConcept,
  createReference,
} from '../../types/fhir';

// ============================================================================
// RAJAN - The Pressure-Forged Pro (34, high performer with sleep/glucose issues)
// ============================================================================

export const rajanConditions: FhirCondition[] = [
  {
    resourceType: 'Condition',
    id: 'rajan-cond-prediabetes',
    meta: {
      lastUpdated: '2024-11-15T10:30:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    category: [
      createCodeableConcept(
        'http://terminology.hl7.org/CodeSystem/condition-category',
        'problem-list-item',
        'Problem List Item'
      ),
    ],
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.PREDIABETES.code,
      ICD10_CODES.PREDIABETES.display
    ),
    subject: createReference('Patient', 'rajan', 'Rajan P.'),
    onsetDateTime: '2024-03-15',
    recordedDate: '2024-03-20',
    note: [
      {
        text: 'Fasting glucose 104 mg/dL. Patient counseled on lifestyle modifications. Strong correlation with sleep patterns identified.',
        time: '2024-03-20T14:00:00Z',
      },
    ],
    _serifLinkedInsights: ['rajan-insight-sleep-glucose', 'rajan-insight-eating-window'],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'rajan-cond-insomnia',
    meta: {
      lastUpdated: '2024-10-01T09:15:00Z',
      source: 'Carequality',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.INSOMNIA.code,
      ICD10_CODES.INSOMNIA.display
    ),
    subject: createReference('Patient', 'rajan', 'Rajan P.'),
    onsetDateTime: '2024-06-01',
    recordedDate: '2024-10-01',
    note: [
      {
        text: 'Sleep onset insomnia, average latency 35+ minutes. Correlates with late evening workouts and work stress.',
        time: '2024-10-01T09:15:00Z',
      },
    ],
    _serifLinkedInsights: ['rajan-insight-bedtime', 'rajan-insight-workout-timing'],
    _serifSource: 'Carequality',
  },
  {
    resourceType: 'Condition',
    id: 'rajan-cond-anxiety',
    meta: {
      lastUpdated: '2024-08-15T11:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.ANXIETY_GAD.code,
      ICD10_CODES.ANXIETY_GAD.display
    ),
    subject: createReference('Patient', 'rajan', 'Rajan P.'),
    onsetDateTime: '2024-02-01',
    recordedDate: '2024-08-15',
    note: [
      {
        text: 'Work-related anxiety. HRV patterns show elevated stress response. Patient declined medication, pursuing behavioral interventions.',
        time: '2024-08-15T11:00:00Z',
      },
    ],
    _serifLinkedInsights: ['rajan-insight-hrv-stress'],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'rajan-cond-hypertension-borderline',
    meta: {
      lastUpdated: '2024-09-01T14:30:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'provisional',
      'Provisional'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.HYPERTENSION.code,
      'Essential hypertension, borderline'
    ),
    subject: createReference('Patient', 'rajan', 'Rajan P.'),
    onsetDateTime: '2024-09-01',
    recordedDate: '2024-09-01',
    note: [
      {
        text: 'Borderline elevated BP readings (135/88 average). Monitoring with wearable data. Lifestyle modifications recommended.',
        time: '2024-09-01T14:30:00Z',
      },
    ],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'rajan-cond-vitamin-d',
    meta: {
      lastUpdated: '2024-04-01T10:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.VITAMIN_D_DEFICIENCY.code,
      ICD10_CODES.VITAMIN_D_DEFICIENCY.display
    ),
    subject: createReference('Patient', 'rajan', 'Rajan P.'),
    onsetDateTime: '2024-04-01',
    recordedDate: '2024-04-01',
    note: [
      {
        text: 'Vitamin D level 22 ng/mL. Started on supplementation 2000 IU daily.',
        time: '2024-04-01T10:00:00Z',
      },
    ],
    _serifSource: 'CommonWell',
  },
];

// ============================================================================
// SARAH - The Metabolic Optimizer (41, reversed T2DM trends)
// ============================================================================

export const sarahConditions: FhirCondition[] = [
  {
    resourceType: 'Condition',
    id: 'sarah-cond-t2dm',
    meta: {
      lastUpdated: '2024-12-01T09:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    severity: createCodeableConcept(
      CODE_SYSTEMS.SNOMED,
      '255604002',
      'Mild'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.T2DM.code,
      ICD10_CODES.T2DM.display
    ),
    subject: createReference('Patient', 'sarah', 'Sarah M.'),
    onsetDateTime: '2022-06-15',
    recordedDate: '2022-06-20',
    note: [
      {
        text: 'Initially diagnosed with HbA1c 7.2%. Through lifestyle optimization, now maintained at 6.2%. Exemplary response to behavioral interventions.',
        time: '2024-12-01T09:00:00Z',
      },
    ],
    _serifLinkedInsights: ['sarah-insight-eating-window', 'sarah-insight-glucose-sleep'],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'sarah-cond-hyperlipidemia',
    meta: {
      lastUpdated: '2024-11-01T10:30:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.HYPERLIPIDEMIA.code,
      ICD10_CODES.HYPERLIPIDEMIA.display
    ),
    subject: createReference('Patient', 'sarah', 'Sarah M.'),
    onsetDateTime: '2022-06-15',
    recordedDate: '2022-06-20',
    note: [
      {
        text: 'Mixed hyperlipidemia. LDL improved from 142 to 108 with statin + lifestyle. Triglycerides normalized with eating window optimization.',
        time: '2024-11-01T10:30:00Z',
      },
    ],
    _serifLinkedInsights: ['sarah-insight-eating-window'],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'sarah-cond-obesity',
    meta: {
      lastUpdated: '2024-10-15T11:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.OBESITY.code,
      'Obesity, Class I (BMI 30-34.9)'
    ),
    subject: createReference('Patient', 'sarah', 'Sarah M.'),
    onsetDateTime: '2020-01-01',
    recordedDate: '2022-06-20',
    note: [
      {
        text: 'BMI trending down: 33.2 → 30.1 over 18 months. Patient highly engaged with personalized protocols.',
        time: '2024-10-15T11:00:00Z',
      },
    ],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'sarah-cond-gerd',
    meta: {
      lastUpdated: '2024-06-01T09:00:00Z',
      source: 'Carequality',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.GERD.code,
      ICD10_CODES.GERD.display
    ),
    subject: createReference('Patient', 'sarah', 'Sarah M.'),
    onsetDateTime: '2021-03-01',
    recordedDate: '2021-03-15',
    note: [
      {
        text: 'Symptoms improved significantly with earlier eating window cutoff. Reduced omeprazole from daily to PRN.',
        time: '2024-06-01T09:00:00Z',
      },
    ],
    _serifLinkedInsights: ['sarah-insight-eating-window'],
    _serifSource: 'Carequality',
  },
  {
    resourceType: 'Condition',
    id: 'sarah-cond-hypertension',
    meta: {
      lastUpdated: '2024-09-01T10:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'resolved',
      'Resolved'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.HYPERTENSION.code,
      ICD10_CODES.HYPERTENSION.display
    ),
    subject: createReference('Patient', 'sarah', 'Sarah M.'),
    onsetDateTime: '2022-06-15',
    abatementDateTime: '2024-06-01',
    recordedDate: '2022-06-20',
    note: [
      {
        text: 'Hypertension resolved with weight loss and lifestyle changes. BP now consistently 118/76. No medication needed.',
        time: '2024-09-01T10:00:00Z',
      },
    ],
    _serifSource: 'CommonWell',
  },
];

// ============================================================================
// MARCUS - The Recovery Specialist (47, former athlete, inflammation focus)
// ============================================================================

export const marcusConditions: FhirCondition[] = [
  {
    resourceType: 'Condition',
    id: 'marcus-cond-osteoarthritis',
    meta: {
      lastUpdated: '2024-10-01T14:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      'M17.11',
      'Primary osteoarthritis, right knee'
    ),
    subject: createReference('Patient', 'marcus', 'Marcus J.'),
    onsetDateTime: '2019-01-01',
    recordedDate: '2019-03-15',
    note: [
      {
        text: 'Former collegiate athlete. Moderate OA right knee. Managed with activity modification and anti-inflammatory protocols. Avoiding surgery.',
        time: '2024-10-01T14:00:00Z',
      },
    ],
    _serifLinkedInsights: ['marcus-insight-inflammation', 'marcus-insight-recovery'],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'marcus-cond-sleep-apnea',
    meta: {
      lastUpdated: '2024-08-15T10:00:00Z',
      source: 'Carequality',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    severity: createCodeableConcept(
      CODE_SYSTEMS.SNOMED,
      '255604002',
      'Mild'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.SLEEP_APNEA.code,
      'Obstructive sleep apnea, mild'
    ),
    subject: createReference('Patient', 'marcus', 'Marcus J.'),
    onsetDateTime: '2023-06-01',
    recordedDate: '2023-06-15',
    note: [
      {
        text: 'AHI 8.2 on sleep study. Managing with positional therapy and weight optimization. CPAP not required at this time.',
        time: '2024-08-15T10:00:00Z',
      },
    ],
    _serifLinkedInsights: ['marcus-insight-sleep-position', 'marcus-insight-deep-sleep'],
    _serifSource: 'Carequality',
  },
  {
    resourceType: 'Condition',
    id: 'marcus-cond-hypertension',
    meta: {
      lastUpdated: '2024-11-01T09:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.HYPERTENSION_CONTROLLED.code,
      'Essential hypertension, well controlled'
    ),
    subject: createReference('Patient', 'marcus', 'Marcus J.'),
    onsetDateTime: '2020-03-01',
    recordedDate: '2020-03-15',
    note: [
      {
        text: 'Well controlled on lisinopril 10mg. Average BP 122/78 per home and wearable monitoring.',
        time: '2024-11-01T09:00:00Z',
      },
    ],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'marcus-cond-chronic-inflammation',
    meta: {
      lastUpdated: '2024-09-01T11:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      'R79.89',
      'Other specified abnormal findings of blood chemistry - elevated inflammatory markers'
    ),
    subject: createReference('Patient', 'marcus', 'Marcus J.'),
    onsetDateTime: '2023-01-01',
    recordedDate: '2023-01-15',
    note: [
      {
        text: 'Chronically elevated hs-CRP (3.2-4.8 mg/L). Correlates with training load and alcohol intake. Focus on recovery optimization.',
        time: '2024-09-01T11:00:00Z',
      },
    ],
    _serifLinkedInsights: ['marcus-insight-inflammation', 'marcus-insight-alcohol-crp'],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'marcus-cond-chronic-pain',
    meta: {
      lastUpdated: '2024-07-01T10:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.CHRONIC_PAIN.code,
      ICD10_CODES.CHRONIC_PAIN.display
    ),
    subject: createReference('Patient', 'marcus', 'Marcus J.'),
    onsetDateTime: '2019-06-01',
    recordedDate: '2019-06-15',
    note: [
      {
        text: 'Chronic knee pain related to OA. Managed conservatively. Pain levels correlate strongly with sleep quality and recovery metrics.',
        time: '2024-07-01T10:00:00Z',
      },
    ],
    _serifLinkedInsights: ['marcus-insight-pain-sleep'],
    _serifSource: 'CommonWell',
  },
];

// ============================================================================
// EMMA - The New Explorer (28, limited data, population priors)
// ============================================================================

export const emmaConditions: FhirCondition[] = [
  {
    resourceType: 'Condition',
    id: 'emma-cond-anxiety',
    meta: {
      lastUpdated: '2024-11-01T14:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.ANXIETY_GAD.code,
      ICD10_CODES.ANXIETY_GAD.display
    ),
    subject: createReference('Patient', 'emma', 'Emma L.'),
    onsetDateTime: '2023-01-01',
    recordedDate: '2023-02-01',
    note: [
      {
        text: 'GAD diagnosed in 2023. On sertraline with good response. Interested in understanding behavioral triggers.',
        time: '2024-11-01T14:00:00Z',
      },
    ],
    _serifLinkedInsights: ['emma-insight-hrv-anxiety'],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'emma-cond-headaches',
    meta: {
      lastUpdated: '2024-10-01T10:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.TENSION_HEADACHE.code,
      ICD10_CODES.TENSION_HEADACHE.display
    ),
    subject: createReference('Patient', 'emma', 'Emma L.'),
    onsetDateTime: '2022-06-01',
    recordedDate: '2022-06-15',
    note: [
      {
        text: 'Tension headaches 2-3x/week. Triggers include poor sleep and screen time. No migraine features.',
        time: '2024-10-01T10:00:00Z',
      },
    ],
    _serifLinkedInsights: ['emma-insight-headache-sleep'],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'emma-cond-vitamin-d',
    meta: {
      lastUpdated: '2024-11-15T09:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'confirmed',
      'Confirmed'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.VITAMIN_D_DEFICIENCY.code,
      ICD10_CODES.VITAMIN_D_DEFICIENCY.display
    ),
    subject: createReference('Patient', 'emma', 'Emma L.'),
    onsetDateTime: '2024-09-01',
    recordedDate: '2024-09-15',
    note: [
      {
        text: 'Vitamin D 18 ng/mL. Started supplementation 2000 IU daily. Recheck in 3 months.',
        time: '2024-11-15T09:00:00Z',
      },
    ],
    _serifSource: 'CommonWell',
  },
  {
    resourceType: 'Condition',
    id: 'emma-cond-fatigue',
    meta: {
      lastUpdated: '2024-11-01T10:00:00Z',
      source: 'CommonWell',
    },
    clinicalStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_CLINICAL,
      'active',
      'Active'
    ),
    verificationStatus: createCodeableConcept(
      CODE_SYSTEMS.CONDITION_VERIFICATION,
      'provisional',
      'Provisional'
    ),
    code: createCodeableConcept(
      CODE_SYSTEMS.ICD10,
      ICD10_CODES.FATIGUE.code,
      ICD10_CODES.FATIGUE.display
    ),
    subject: createReference('Patient', 'emma', 'Emma L.'),
    onsetDateTime: '2024-06-01',
    recordedDate: '2024-09-01',
    note: [
      {
        text: 'Reports chronic fatigue. Workup negative except for low vitamin D. Correlates with irregular sleep schedule per initial tracking.',
        time: '2024-11-01T10:00:00Z',
      },
    ],
    _serifLinkedInsights: ['emma-insight-sleep-consistency'],
    _serifSource: 'CommonWell',
  },
];

// ============================================================================
// Export all conditions
// ============================================================================

export const allConditions: FhirCondition[] = [
  ...rajanConditions,
  ...sarahConditions,
  ...marcusConditions,
  ...emmaConditions,
];

export function getConditionsForPersona(personaId: string): FhirCondition[] {
  switch (personaId) {
    case 'rajan':
      return rajanConditions;
    case 'sarah':
      return sarahConditions;
    case 'marcus':
      return marcusConditions;
    case 'emma':
      return emmaConditions;
    default:
      return [];
  }
}

export function getConditionById(id: string): FhirCondition | undefined {
  return allConditions.find((c) => c.id === id);
}

export function getActiveConditions(personaId: string): FhirCondition[] {
  return getConditionsForPersona(personaId).filter(
    (c) => c.clinicalStatus.coding[0].code === 'active'
  );
}
