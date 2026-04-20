// FHIR Encounter Resources (Visits & ADT Events) for all Personas
// Realistic visit history and care transitions

import {
  FhirEncounter,
  CODE_SYSTEMS,
  createCodeableConcept,
  createReference,
} from '../../types/fhir';

// ============================================================================
// Helper to create encounter
// ============================================================================

function createEncounter(
  id: string,
  personaId: string,
  personaName: string,
  encounterClass: { code: string; display: string },
  encounterType: FhirEncounter['_serifEncounterType'],
  status: FhirEncounter['status'],
  startDate: string,
  endDate: string | undefined,
  reasonCode: string,
  reasonDisplay: string,
  providerName: string,
  locationName: string,
  source: FhirEncounter['_serifSource'] = 'CommonWell',
  adtType?: FhirEncounter['_serifAdtType']
): FhirEncounter {
  const enc: FhirEncounter = {
    resourceType: 'Encounter',
    id,
    meta: {
      lastUpdated: `${startDate}T18:00:00Z`,
      source,
    },
    status,
    class: {
      system: CODE_SYSTEMS.ENCOUNTER_CLASS,
      code: encounterClass.code,
      display: encounterClass.display,
    },
    type: [
      createCodeableConcept(
        CODE_SYSTEMS.CPT,
        '99213',
        'Office or outpatient visit'
      ),
    ],
    subject: createReference('Patient', personaId, personaName),
    participant: [
      {
        individual: createReference('Practitioner', `pract-${id}`, providerName),
      },
    ],
    period: {
      start: `${startDate}T09:00:00Z`,
      end: endDate ? `${endDate}T10:00:00Z` : undefined,
    },
    reasonCode: [
      createCodeableConcept(CODE_SYSTEMS.ICD10, reasonCode, reasonDisplay),
    ],
    location: [
      {
        location: createReference('Location', `loc-${id}`, locationName),
        status: 'completed',
      },
    ],
    serviceProvider: createReference('Organization', `org-${id}`, locationName),
    _serifEncounterType: encounterType,
    _serifSource: source,
  };

  if (adtType) {
    enc._serifAdtType = adtType;
  }

  return enc;
}

// ============================================================================
// RAJAN - Encounters (PCP visits, sleep specialist)
// ============================================================================

export const rajanEncounters: FhirEncounter[] = [
  createEncounter(
    'rajan-enc-pcp-2024-03',
    'rajan',
    'Rajan P.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-03-20',
    '2024-03-20',
    'R73.03',
    'Prediabetes - Initial diagnosis',
    'Dr. Jennifer Martinez',
    'Bay Area Internal Medicine',
    'CommonWell'
  ),
  createEncounter(
    'rajan-enc-pcp-2024-08',
    'rajan',
    'Rajan P.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-08-20',
    '2024-08-20',
    'R73.03',
    'Prediabetes - Follow-up',
    'Dr. Jennifer Martinez',
    'Bay Area Internal Medicine',
    'CommonWell'
  ),
  createEncounter(
    'rajan-enc-sleep-2024-10',
    'rajan',
    'Rajan P.',
    { code: 'AMB', display: 'ambulatory' },
    'specialist',
    'finished',
    '2024-10-01',
    '2024-10-01',
    'G47.00',
    'Insomnia evaluation',
    'Dr. Michael Chen',
    'Peninsula Sleep Medicine',
    'Carequality'
  ),
  createEncounter(
    'rajan-enc-pcp-2024-12',
    'rajan',
    'Rajan P.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-12-10',
    '2024-12-10',
    'R73.03',
    'Prediabetes - 3 month follow-up, labs review',
    'Dr. Jennifer Martinez',
    'Bay Area Internal Medicine',
    'CommonWell'
  ),
  createEncounter(
    'rajan-enc-lab-2024-12',
    'rajan',
    'Rajan P.',
    { code: 'AMB', display: 'ambulatory' },
    'lab-draw',
    'finished',
    '2024-12-08',
    '2024-12-08',
    'Z00.00',
    'Routine lab draw',
    'Quest Diagnostics',
    'Quest Diagnostics - Palo Alto',
    'CommonWell'
  ),
];

// ============================================================================
// SARAH - Encounters (PCP, endocrinology, showing improvement journey)
// ============================================================================

export const sarahEncounters: FhirEncounter[] = [
  createEncounter(
    'sarah-enc-pcp-2024-03',
    'sarah',
    'Sarah M.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-03-01',
    '2024-03-01',
    'E11.9',
    'Type 2 diabetes - Quarterly review',
    'Dr. Robert Kim',
    'Mission District Health Center',
    'CommonWell'
  ),
  createEncounter(
    'sarah-enc-endo-2024-04',
    'sarah',
    'Sarah M.',
    { code: 'AMB', display: 'ambulatory' },
    'specialist',
    'finished',
    '2024-04-15',
    '2024-04-15',
    'E11.9',
    'Endocrinology consultation - Lifestyle optimization review',
    'Dr. Amanda Foster',
    'UCSF Diabetes Center',
    'Carequality'
  ),
  createEncounter(
    'sarah-enc-pcp-2024-06',
    'sarah',
    'Sarah M.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-06-15',
    '2024-06-15',
    'E11.9',
    'Type 2 diabetes - Follow-up, improving metrics',
    'Dr. Robert Kim',
    'Mission District Health Center',
    'CommonWell'
  ),
  createEncounter(
    'sarah-enc-pcp-2024-09',
    'sarah',
    'Sarah M.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-09-20',
    '2024-09-20',
    'E11.9',
    'Type 2 diabetes - Significant improvement noted',
    'Dr. Robert Kim',
    'Mission District Health Center',
    'CommonWell'
  ),
  createEncounter(
    'sarah-enc-endo-2024-10',
    'sarah',
    'Sarah M.',
    { code: 'AMB', display: 'ambulatory' },
    'specialist',
    'finished',
    '2024-10-25',
    '2024-10-25',
    'E11.9',
    'Endocrinology - Celebrate metabolic improvements',
    'Dr. Amanda Foster',
    'UCSF Diabetes Center',
    'Carequality'
  ),
  createEncounter(
    'sarah-enc-pcp-2024-12',
    'sarah',
    'Sarah M.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-12-05',
    '2024-12-05',
    'E11.9',
    'Type 2 diabetes - Annual review, excellent control',
    'Dr. Robert Kim',
    'Mission District Health Center',
    'CommonWell'
  ),
];

// ============================================================================
// MARCUS - Encounters (PCP, rheumatology, sleep study)
// ============================================================================

export const marcusEncounters: FhirEncounter[] = [
  createEncounter(
    'marcus-enc-pcp-2024-06',
    'marcus',
    'Marcus J.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-06-01',
    '2024-06-01',
    'I10',
    'Hypertension - Routine follow-up',
    'Dr. William Thompson',
    'Oakland Primary Care Associates',
    'CommonWell'
  ),
  createEncounter(
    'marcus-enc-rheum-2024-07',
    'marcus',
    'Marcus J.',
    { code: 'AMB', display: 'ambulatory' },
    'specialist',
    'finished',
    '2024-07-15',
    '2024-07-15',
    'M17.11',
    'Osteoarthritis - Annual evaluation',
    'Dr. Lisa Yamamoto',
    'East Bay Rheumatology',
    'Carequality'
  ),
  createEncounter(
    'marcus-enc-sleep-study-2024-08',
    'marcus',
    'Marcus J.',
    { code: 'AMB', display: 'ambulatory' },
    'specialist',
    'finished',
    '2024-08-15',
    '2024-08-16',
    'G47.33',
    'Sleep study - Mild OSA confirmed',
    'Dr. David Park',
    'Oakland Sleep Center',
    'Carequality'
  ),
  createEncounter(
    'marcus-enc-pcp-2024-10',
    'marcus',
    'Marcus J.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-10-15',
    '2024-10-15',
    'R79.89',
    'Inflammatory markers review',
    'Dr. William Thompson',
    'Oakland Primary Care Associates',
    'CommonWell'
  ),
  createEncounter(
    'marcus-enc-pcp-2024-11',
    'marcus',
    'Marcus J.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-11-01',
    '2024-11-01',
    'I10',
    'Hypertension - BP well controlled',
    'Dr. William Thompson',
    'Oakland Primary Care Associates',
    'CommonWell'
  ),
];

// ============================================================================
// EMMA - Encounters (PCP visits, limited history)
// ============================================================================

export const emmaEncounters: FhirEncounter[] = [
  createEncounter(
    'emma-enc-pcp-2024-09',
    'emma',
    'Emma L.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-09-01',
    '2024-09-01',
    'R53.83',
    'Fatigue workup',
    'Dr. Sarah Johnson',
    'SF Family Medicine',
    'CommonWell'
  ),
  createEncounter(
    'emma-enc-pcp-2024-11',
    'emma',
    'Emma L.',
    { code: 'AMB', display: 'ambulatory' },
    'pcp-visit',
    'finished',
    '2024-11-01',
    '2024-11-01',
    'F41.1',
    'Anxiety follow-up, discuss wearable tracking',
    'Dr. Sarah Johnson',
    'SF Family Medicine',
    'CommonWell'
  ),
  createEncounter(
    'emma-enc-lab-2024-11',
    'emma',
    'Emma L.',
    { code: 'AMB', display: 'ambulatory' },
    'lab-draw',
    'finished',
    '2024-11-01',
    '2024-11-01',
    'Z00.00',
    'Routine lab draw - fatigue workup',
    'Quest Diagnostics',
    'Quest Diagnostics - SF Downtown',
    'CommonWell'
  ),
];

// ============================================================================
// ADT Events (Hospital/ED events - examples)
// ============================================================================

// Sarah had a brief ED visit for hypoglycemia early in her journey
export const sarahAdtEvents: FhirEncounter[] = [
  {
    resourceType: 'Encounter',
    id: 'sarah-enc-ed-2023-08',
    meta: {
      lastUpdated: '2023-08-15T06:00:00Z',
      source: 'Bamboo',
    },
    status: 'finished',
    class: {
      system: CODE_SYSTEMS.ENCOUNTER_CLASS,
      code: 'EMER',
      display: 'emergency',
    },
    type: [
      createCodeableConcept(CODE_SYSTEMS.CPT, '99283', 'Emergency department visit'),
    ],
    subject: createReference('Patient', 'sarah', 'Sarah M.'),
    period: {
      start: '2023-08-15T02:30:00Z',
      end: '2023-08-15T06:00:00Z',
    },
    reasonCode: [
      createCodeableConcept(CODE_SYSTEMS.ICD10, 'E16.2', 'Hypoglycemia, unspecified'),
    ],
    hospitalization: {
      dischargeDisposition: createCodeableConcept(
        'http://terminology.hl7.org/CodeSystem/discharge-disposition',
        'home',
        'Discharged to home'
      ),
    },
    location: [
      {
        location: createReference('Location', 'loc-sfgh-ed', 'SFGH Emergency Department'),
        status: 'completed',
      },
    ],
    _serifEncounterType: 'ed-visit',
    _serifSource: 'Bamboo',
    _serifAdtType: 'A03',
  },
];

// ============================================================================
// Export all encounters
// ============================================================================

export const allEncounters: FhirEncounter[] = [
  ...rajanEncounters,
  ...sarahEncounters,
  ...sarahAdtEvents,
  ...marcusEncounters,
  ...emmaEncounters,
];

export function getEncountersForPersona(personaId: string): FhirEncounter[] {
  switch (personaId) {
    case 'rajan':
      return rajanEncounters;
    case 'sarah':
      return [...sarahEncounters, ...sarahAdtEvents];
    case 'marcus':
      return marcusEncounters;
    case 'emma':
      return emmaEncounters;
    default:
      return [];
  }
}

export function getEncounterById(id: string): FhirEncounter | undefined {
  return allEncounters.find((e) => e.id === id);
}

export function getRecentEncounters(
  personaId: string,
  limit: number = 5
): FhirEncounter[] {
  return getEncountersForPersona(personaId)
    .sort(
      (a, b) =>
        new Date(b.period?.start || '').getTime() -
        new Date(a.period?.start || '').getTime()
    )
    .slice(0, limit);
}

export function getEncountersByType(
  personaId: string,
  type: FhirEncounter['_serifEncounterType']
): FhirEncounter[] {
  return getEncountersForPersona(personaId).filter(
    (e) => e._serifEncounterType === type
  );
}

export function getAdtEvents(personaId: string): FhirEncounter[] {
  return getEncountersForPersona(personaId).filter(
    (e) =>
      e._serifEncounterType === 'ed-visit' ||
      e._serifEncounterType === 'inpatient' ||
      e._serifAdtType !== undefined
  );
}
