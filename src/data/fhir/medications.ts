// FHIR MedicationStatement Resources for all Personas
// Realistic medications aligned with each persona's conditions

import {
  FhirMedicationStatement,
  CODE_SYSTEMS,
  createCodeableConcept,
  createReference,
} from '../../types/fhir';

// ============================================================================
// Helper to create medication statement
// ============================================================================

function createMedication(
  id: string,
  personaId: string,
  personaName: string,
  rxnormCode: string,
  drugName: string,
  status: FhirMedicationStatement['status'],
  doseText: string,
  startDate: string,
  adherence: number,
  source: FhirMedicationStatement['_serifSource'] = 'Surescripts',
  reasonCodes?: { code: string; display: string }[],
  lastFill?: string,
  nextRefill?: string
): FhirMedicationStatement {
  const med: FhirMedicationStatement = {
    resourceType: 'MedicationStatement',
    id,
    meta: {
      lastUpdated: `${startDate}T12:00:00Z`,
      source,
    },
    status,
    medicationCodeableConcept: createCodeableConcept(
      CODE_SYSTEMS.RXNORM,
      rxnormCode,
      drugName
    ),
    subject: createReference('Patient', personaId, personaName),
    effectivePeriod: {
      start: startDate,
    },
    dateAsserted: startDate,
    dosage: [
      {
        text: doseText,
      },
    ],
    _serifAdherence: adherence,
    _serifSource: source,
    _serifLastFill: lastFill,
    _serifNextRefill: nextRefill,
  };

  if (reasonCodes && reasonCodes.length > 0) {
    med.reasonCode = reasonCodes.map((r) =>
      createCodeableConcept(CODE_SYSTEMS.ICD10, r.code, r.display)
    );
  }

  return med;
}

// ============================================================================
// RAJAN - Medications (prediabetes, anxiety, supplements)
// ============================================================================

export const rajanMedications: FhirMedicationStatement[] = [
  createMedication(
    'rajan-med-metformin',
    'rajan',
    'Rajan P.',
    '860975',
    'Metformin 500 MG Oral Tablet',
    'active',
    'Take 500mg by mouth once daily with dinner',
    '2024-03-20',
    94,
    'Surescripts',
    [{ code: 'R73.03', display: 'Prediabetes' }],
    '2024-12-01',
    '2024-12-29'
  ),
  createMedication(
    'rajan-med-vitamin-d',
    'rajan',
    'Rajan P.',
    '315246',
    'Cholecalciferol 2000 UNT Oral Capsule',
    'active',
    'Take 2000 IU by mouth once daily',
    '2024-04-01',
    88,
    'Manual',
    [{ code: 'E55.9', display: 'Vitamin D deficiency' }],
    '2024-11-15'
  ),
  createMedication(
    'rajan-med-magnesium',
    'rajan',
    'Rajan P.',
    '197803',
    'Magnesium Glycinate 400 MG Oral Capsule',
    'active',
    'Take 400mg by mouth at bedtime for sleep support',
    '2024-06-01',
    76,
    'Manual'
  ),
  createMedication(
    'rajan-med-melatonin',
    'rajan',
    'Rajan P.',
    '828303',
    'Melatonin 0.5 MG Oral Tablet',
    'active',
    'Take 0.5mg by mouth 30 minutes before bed as needed',
    '2024-10-01',
    45, // PRN usage
    'Manual'
  ),
];

// ============================================================================
// SARAH - Medications (diabetes, cholesterol, GERD)
// ============================================================================

export const sarahMedications: FhirMedicationStatement[] = [
  createMedication(
    'sarah-med-metformin',
    'sarah',
    'Sarah M.',
    '861007',
    'Metformin 1000 MG Oral Tablet',
    'active',
    'Take 1000mg by mouth twice daily with meals',
    '2022-06-20',
    96,
    'Surescripts',
    [{ code: 'E11.9', display: 'Type 2 diabetes' }],
    '2024-12-05',
    '2025-01-02'
  ),
  createMedication(
    'sarah-med-atorvastatin',
    'sarah',
    'Sarah M.',
    '617312',
    'Atorvastatin 20 MG Oral Tablet',
    'active',
    'Take 20mg by mouth once daily at bedtime',
    '2022-06-20',
    92,
    'Surescripts',
    [{ code: 'E78.5', display: 'Hyperlipidemia' }],
    '2024-11-20',
    '2024-12-18'
  ),
  createMedication(
    'sarah-med-omeprazole',
    'sarah',
    'Sarah M.',
    '198052',
    'Omeprazole 20 MG Delayed Release Oral Capsule',
    'active',
    'Take 20mg by mouth once daily before breakfast as needed',
    '2021-03-15',
    35, // Reduced from daily to PRN
    'Surescripts',
    [{ code: 'K21.0', display: 'GERD' }],
    '2024-10-01'
  ),
  createMedication(
    'sarah-med-vitamin-d',
    'sarah',
    'Sarah M.',
    '315246',
    'Cholecalciferol 2000 UNT Oral Capsule',
    'active',
    'Take 2000 IU by mouth once daily',
    '2023-01-01',
    85,
    'Manual'
  ),
  createMedication(
    'sarah-med-fish-oil',
    'sarah',
    'Sarah M.',
    '310404',
    'Fish Oil 1000 MG Oral Capsule',
    'active',
    'Take 2 capsules by mouth once daily with food',
    '2023-06-01',
    78,
    'Manual'
  ),
];

// ============================================================================
// MARCUS - Medications (hypertension, inflammation, supplements)
// ============================================================================

export const marcusMedications: FhirMedicationStatement[] = [
  createMedication(
    'marcus-med-lisinopril',
    'marcus',
    'Marcus J.',
    '314076',
    'Lisinopril 10 MG Oral Tablet',
    'active',
    'Take 10mg by mouth once daily in the morning',
    '2020-03-15',
    98,
    'Surescripts',
    [{ code: 'I10', display: 'Hypertension' }],
    '2024-12-01',
    '2024-12-29'
  ),
  createMedication(
    'marcus-med-celecoxib',
    'marcus',
    'Marcus J.',
    '140587',
    'Celecoxib 200 MG Oral Capsule',
    'active',
    'Take 200mg by mouth once daily as needed for pain',
    '2019-06-15',
    52, // PRN for flares
    'Surescripts',
    [{ code: 'M17.11', display: 'Osteoarthritis, right knee' }],
    '2024-11-15'
  ),
  createMedication(
    'marcus-med-fish-oil',
    'marcus',
    'Marcus J.',
    '310404',
    'Fish Oil 2000 MG Oral Capsule',
    'active',
    'Take 2000mg by mouth twice daily with food (4g total)',
    '2023-01-15',
    92,
    'Manual',
    [{ code: 'R79.89', display: 'Elevated inflammatory markers' }]
  ),
  createMedication(
    'marcus-med-vitamin-d',
    'marcus',
    'Marcus J.',
    '315249',
    'Cholecalciferol 5000 UNT Oral Capsule',
    'active',
    'Take 5000 IU by mouth once daily',
    '2022-01-01',
    95,
    'Manual'
  ),
  createMedication(
    'marcus-med-curcumin',
    'marcus',
    'Marcus J.',
    '1809092',
    'Turmeric/Curcumin 500 MG Oral Capsule',
    'active',
    'Take 1000mg by mouth twice daily with food',
    '2023-06-01',
    88,
    'Manual',
    [{ code: 'R79.89', display: 'Elevated inflammatory markers' }]
  ),
  createMedication(
    'marcus-med-glucosamine',
    'marcus',
    'Marcus J.',
    '198211',
    'Glucosamine Sulfate 1500 MG Oral Tablet',
    'active',
    'Take 1500mg by mouth once daily',
    '2019-09-01',
    82,
    'Manual',
    [{ code: 'M17.11', display: 'Osteoarthritis' }]
  ),
];

// ============================================================================
// EMMA - Medications (anxiety, supplements)
// ============================================================================

export const emmaMedications: FhirMedicationStatement[] = [
  createMedication(
    'emma-med-sertraline',
    'emma',
    'Emma L.',
    '312938',
    'Sertraline 50 MG Oral Tablet',
    'active',
    'Take 50mg by mouth once daily in the morning',
    '2023-02-01',
    89,
    'Surescripts',
    [{ code: 'F41.1', display: 'Generalized anxiety disorder' }],
    '2024-11-15',
    '2024-12-13'
  ),
  createMedication(
    'emma-med-vitamin-d',
    'emma',
    'Emma L.',
    '315246',
    'Cholecalciferol 2000 UNT Oral Capsule',
    'active',
    'Take 2000 IU by mouth once daily',
    '2024-09-15',
    72,
    'Manual',
    [{ code: 'E55.9', display: 'Vitamin D deficiency' }]
  ),
  createMedication(
    'emma-med-birth-control',
    'emma',
    'Emma L.',
    '749762',
    'Norgestimate-Ethinyl Estradiol Oral Tablet',
    'active',
    'Take 1 tablet by mouth daily as directed',
    '2021-01-01',
    95,
    'Surescripts',
    undefined,
    '2024-11-01',
    '2024-12-01'
  ),
  createMedication(
    'emma-med-ibuprofen',
    'emma',
    'Emma L.',
    '310965',
    'Ibuprofen 400 MG Oral Tablet',
    'active',
    'Take 400mg by mouth every 6 hours as needed for headache',
    '2022-06-15',
    25, // PRN
    'Manual',
    [{ code: 'G44.2', display: 'Tension headache' }]
  ),
];

// ============================================================================
// Export all medications
// ============================================================================

export const allMedications: FhirMedicationStatement[] = [
  ...rajanMedications,
  ...sarahMedications,
  ...marcusMedications,
  ...emmaMedications,
];

export function getMedicationsForPersona(personaId: string): FhirMedicationStatement[] {
  switch (personaId) {
    case 'rajan':
      return rajanMedications;
    case 'sarah':
      return sarahMedications;
    case 'marcus':
      return marcusMedications;
    case 'emma':
      return emmaMedications;
    default:
      return [];
  }
}

export function getMedicationById(id: string): FhirMedicationStatement | undefined {
  return allMedications.find((m) => m.id === id);
}

export function getActiveMedications(personaId: string): FhirMedicationStatement[] {
  return getMedicationsForPersona(personaId).filter((m) => m.status === 'active');
}

export function getMedicationsWithLowAdherence(
  personaId: string,
  threshold: number = 70
): FhirMedicationStatement[] {
  return getMedicationsForPersona(personaId).filter(
    (m) => m.status === 'active' && (m._serifAdherence || 100) < threshold
  );
}
