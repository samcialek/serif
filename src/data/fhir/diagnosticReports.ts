// FHIR DiagnosticReport Resources for all Personas
// Lab panels that group related observations

import {
  FhirDiagnosticReport,
  CODE_SYSTEMS,
  createCodeableConcept,
  createReference,
} from '../../types/fhir';

// ============================================================================
// Helper to create diagnostic report
// ============================================================================

function createDiagnosticReport(
  id: string,
  personaId: string,
  personaName: string,
  loincCode: string,
  reportName: string,
  effectiveDate: string,
  observationIds: string[],
  conclusion: string,
  source: FhirDiagnosticReport['_serifSource'] = 'Quest',
  performerName: string = 'Quest Diagnostics'
): FhirDiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    id,
    meta: {
      lastUpdated: `${effectiveDate}T18:00:00Z`,
      source,
    },
    status: 'final',
    category: [
      createCodeableConcept(
        'http://terminology.hl7.org/CodeSystem/v2-0074',
        'LAB',
        'Laboratory'
      ),
    ],
    code: createCodeableConcept(CODE_SYSTEMS.LOINC, loincCode, reportName),
    subject: createReference('Patient', personaId, personaName),
    effectiveDateTime: `${effectiveDate}T08:00:00Z`,
    issued: `${effectiveDate}T18:00:00Z`,
    performer: [createReference('Organization', `org-${id}`, performerName)],
    result: observationIds.map((obsId) =>
      createReference('Observation', obsId, '')
    ),
    conclusion,
    _serifSource: source,
  };
}

// ============================================================================
// RAJAN - Diagnostic Reports (Metabolic panels, lipid panels)
// ============================================================================

export const rajanDiagnosticReports: FhirDiagnosticReport[] = [
  // March 2024 - Initial prediabetes workup
  createDiagnosticReport(
    'rajan-dr-cmp-2024-03',
    'rajan',
    'Rajan P.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-03-15',
    ['rajan-obs-glucose-2024-03', 'rajan-obs-hba1c-2024-03'],
    'Fasting glucose 98 mg/dL (borderline). HbA1c 5.5% in prediabetes range. Recommend lifestyle modifications and follow-up in 3 months.'
  ),
  createDiagnosticReport(
    'rajan-dr-lipid-2024-03',
    'rajan',
    'Rajan P.',
    '24331-1',
    'Lipid Panel',
    '2024-03-15',
    [
      'rajan-obs-cholesterol-2024-03',
      'rajan-obs-ldl-2024-03',
      'rajan-obs-hdl-2024-03',
      'rajan-obs-trig-2024-03',
    ],
    'Lipid panel within normal limits. Total cholesterol 185, LDL 108, HDL 52, Triglycerides 125.'
  ),

  // August 2024 - Follow-up showing slight progression
  createDiagnosticReport(
    'rajan-dr-cmp-2024-08',
    'rajan',
    'Rajan P.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-08-10',
    ['rajan-obs-glucose-2024-08', 'rajan-obs-hba1c-2024-08'],
    'Fasting glucose 101 mg/dL (elevated). HbA1c 5.6%. Slight upward trend noted. Patient reports work stress and sleep difficulties. Reinforce lifestyle counseling.'
  ),

  // December 2024 - Latest labs showing continued trend
  createDiagnosticReport(
    'rajan-dr-cmp-2024-12',
    'rajan',
    'Rajan P.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-12-08',
    ['rajan-obs-glucose-2024-12', 'rajan-obs-hba1c-2024-12'],
    'Fasting glucose 104 mg/dL. HbA1c 5.7% (at upper boundary of prediabetes). Correlation noted with reported sleep issues - consider sleep study referral. Continue metformin 500mg daily.',
    'Quest'
  ),
  createDiagnosticReport(
    'rajan-dr-lipid-2024-12',
    'rajan',
    'Rajan P.',
    '24331-1',
    'Lipid Panel',
    '2024-12-08',
    [
      'rajan-obs-cholesterol-2024-12',
      'rajan-obs-ldl-2024-12',
      'rajan-obs-hdl-2024-12',
      'rajan-obs-trig-2024-12',
    ],
    'Lipid panel stable. Total cholesterol 188, LDL 112, HDL 50, Triglycerides 130. No significant change from baseline.'
  ),
  createDiagnosticReport(
    'rajan-dr-vitamins-2024-12',
    'rajan',
    'Rajan P.',
    '2132-9',
    'Vitamin D Panel',
    '2024-12-08',
    ['rajan-obs-vitd-2024-12'],
    'Vitamin D 28 ng/mL - insufficient. Continue supplementation with cholecalciferol 2000 IU daily.'
  ),
];

// ============================================================================
// SARAH - Diagnostic Reports (Diabetes management, showing improvement)
// ============================================================================

export const sarahDiagnosticReports: FhirDiagnosticReport[] = [
  // March 2024 - Baseline showing room for improvement
  createDiagnosticReport(
    'sarah-dr-cmp-2024-03',
    'sarah',
    'Sarah M.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-03-01',
    ['sarah-obs-glucose-2024-03', 'sarah-obs-hba1c-2024-03'],
    'Fasting glucose 118 mg/dL. HbA1c 6.8% - above target but improved from previous. Continue current regimen. Patient reports starting walking program.',
    'Quest'
  ),
  createDiagnosticReport(
    'sarah-dr-lipid-2024-03',
    'sarah',
    'Sarah M.',
    '24331-1',
    'Lipid Panel',
    '2024-03-01',
    [
      'sarah-obs-cholesterol-2024-03',
      'sarah-obs-ldl-2024-03',
      'sarah-obs-hdl-2024-03',
      'sarah-obs-trig-2024-03',
    ],
    'Lipid panel improved. LDL 118 (down from 125). Continue atorvastatin 20mg.'
  ),

  // June 2024 - Showing clear improvement
  createDiagnosticReport(
    'sarah-dr-cmp-2024-06',
    'sarah',
    'Sarah M.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-06-10',
    ['sarah-obs-glucose-2024-06', 'sarah-obs-hba1c-2024-06'],
    'Fasting glucose 108 mg/dL (improved). HbA1c 6.5% - at target! Excellent progress. Patient adhering to lifestyle changes including daily walks and improved diet.',
    'Quest'
  ),

  // September 2024 - Continued excellent progress
  createDiagnosticReport(
    'sarah-dr-cmp-2024-09',
    'sarah',
    'Sarah M.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-09-15',
    ['sarah-obs-glucose-2024-09', 'sarah-obs-hba1c-2024-09'],
    'Fasting glucose 100 mg/dL. HbA1c 6.3% - significant improvement! Patient reports consistent exercise routine and wearable tracking helping with motivation.',
    'Quest'
  ),
  createDiagnosticReport(
    'sarah-dr-lipid-2024-09',
    'sarah',
    'Sarah M.',
    '24331-1',
    'Lipid Panel',
    '2024-09-15',
    [
      'sarah-obs-cholesterol-2024-09',
      'sarah-obs-ldl-2024-09',
      'sarah-obs-hdl-2024-09',
      'sarah-obs-trig-2024-09',
    ],
    'Excellent lipid improvement. LDL 102, HDL 58 (improved). Total cholesterol 178. Continue current therapy.'
  ),

  // December 2024 - Best results yet
  createDiagnosticReport(
    'sarah-dr-cmp-2024-12',
    'sarah',
    'Sarah M.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-12-01',
    ['sarah-obs-glucose-2024-12', 'sarah-obs-hba1c-2024-12'],
    'Outstanding results! Fasting glucose 94 mg/dL (normal range). HbA1c 6.2% - best control achieved. Lifestyle modifications show clear sustained benefit. Continue current approach.',
    'Quest'
  ),
  createDiagnosticReport(
    'sarah-dr-lipid-2024-12',
    'sarah',
    'Sarah M.',
    '24331-1',
    'Lipid Panel',
    '2024-12-01',
    [
      'sarah-obs-cholesterol-2024-12',
      'sarah-obs-ldl-2024-12',
      'sarah-obs-hdl-2024-12',
      'sarah-obs-trig-2024-12',
    ],
    'Lipid panel at target. LDL 98 (goal achieved), HDL 60, Triglycerides 118. May consider statin dose reduction at next visit.'
  ),
];

// ============================================================================
// MARCUS - Diagnostic Reports (Inflammation markers, metabolic)
// ============================================================================

export const marcusDiagnosticReports: FhirDiagnosticReport[] = [
  // June 2024 - Routine follow-up
  createDiagnosticReport(
    'marcus-dr-cmp-2024-06',
    'marcus',
    'Marcus J.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-06-01',
    ['marcus-obs-glucose-2024-06', 'marcus-obs-hba1c-2024-06'],
    'Fasting glucose 92 mg/dL - normal. HbA1c 5.4% - excellent. No signs of metabolic dysfunction despite family history.',
    'Quest'
  ),
  createDiagnosticReport(
    'marcus-dr-lipid-2024-06',
    'marcus',
    'Marcus J.',
    '24331-1',
    'Lipid Panel',
    '2024-06-01',
    [
      'marcus-obs-cholesterol-2024-06',
      'marcus-obs-ldl-2024-06',
      'marcus-obs-hdl-2024-06',
      'marcus-obs-trig-2024-06',
    ],
    'Lipid panel shows athletic profile. HDL 62 mg/dL (high-normal, reflects regular exercise). LDL 105, Triglycerides 95. No intervention needed.'
  ),
  createDiagnosticReport(
    'marcus-dr-inflam-2024-06',
    'marcus',
    'Marcus J.',
    '30522-7',
    'Inflammation Panel',
    '2024-06-01',
    ['marcus-obs-crp-2024-06', 'marcus-obs-esr-2024-06'],
    'CRP 3.8 mg/L - mildly elevated. ESR 22 mm/hr - borderline. Correlates with chronic osteoarthritis. Continue anti-inflammatory supplements.'
  ),

  // October 2024 - Follow-up on inflammation
  createDiagnosticReport(
    'marcus-dr-inflam-2024-10',
    'marcus',
    'Marcus J.',
    '30522-7',
    'Inflammation Panel',
    '2024-10-10',
    ['marcus-obs-crp-2024-10', 'marcus-obs-esr-2024-10'],
    'CRP 3.2 mg/L - slight improvement. ESR 20 mm/hr. Omega-3 supplementation and curcumin appear to be helping. Continue current regimen.',
    'Quest'
  ),
  createDiagnosticReport(
    'marcus-dr-cmp-2024-10',
    'marcus',
    'Marcus J.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-10-10',
    ['marcus-obs-glucose-2024-10'],
    'Fasting glucose 90 mg/dL - normal. Metabolic markers remain excellent despite OA-related inflammation.'
  ),

  // November 2024 - Latest results
  createDiagnosticReport(
    'marcus-dr-cmp-2024-11',
    'marcus',
    'Marcus J.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-11-01',
    ['marcus-obs-glucose-2024-11', 'marcus-obs-hba1c-2024-11'],
    'Fasting glucose 88 mg/dL - optimal. HbA1c 5.3% - excellent. Blood pressure well controlled on lisinopril 10mg.',
    'Quest'
  ),
  createDiagnosticReport(
    'marcus-dr-lipid-2024-11',
    'marcus',
    'Marcus J.',
    '24331-1',
    'Lipid Panel',
    '2024-11-01',
    [
      'marcus-obs-cholesterol-2024-11',
      'marcus-obs-ldl-2024-11',
      'marcus-obs-hdl-2024-11',
      'marcus-obs-trig-2024-11',
    ],
    'Excellent lipid profile. HDL 65 (improved with training), LDL 100, Triglycerides 88. Cardiovascular risk low.'
  ),
  createDiagnosticReport(
    'marcus-dr-vitamins-2024-11',
    'marcus',
    'Marcus J.',
    '2132-9',
    'Vitamin D Panel',
    '2024-11-01',
    ['marcus-obs-vitd-2024-11'],
    'Vitamin D 48 ng/mL - optimal. 5000 IU supplementation achieving excellent levels.'
  ),
];

// ============================================================================
// EMMA - Diagnostic Reports (Fatigue workup, anxiety-related)
// ============================================================================

export const emmaDiagnosticReports: FhirDiagnosticReport[] = [
  // September 2024 - Initial fatigue workup
  createDiagnosticReport(
    'emma-dr-cmp-2024-09',
    'emma',
    'Emma L.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-09-01',
    ['emma-obs-glucose-2024-09'],
    'Fasting glucose 88 mg/dL - normal. Basic metabolic panel unremarkable. Fatigue likely multifactorial - consider sleep/stress evaluation.',
    'Quest'
  ),
  createDiagnosticReport(
    'emma-dr-thyroid-2024-09',
    'emma',
    'Emma L.',
    '24348-5',
    'Thyroid Panel',
    '2024-09-01',
    ['emma-obs-tsh-2024-09'],
    'TSH 2.1 mIU/L - normal. Thyroid function does not explain fatigue symptoms.'
  ),
  createDiagnosticReport(
    'emma-dr-cbc-2024-09',
    'emma',
    'Emma L.',
    '58410-2',
    'Complete Blood Count',
    '2024-09-01',
    ['emma-obs-hemoglobin-2024-09'],
    'Hemoglobin 13.2 g/dL - normal. No anemia. CBC within normal limits.'
  ),
  createDiagnosticReport(
    'emma-dr-vitamins-2024-09',
    'emma',
    'Emma L.',
    '2132-9',
    'Vitamin Panel',
    '2024-09-01',
    ['emma-obs-vitd-2024-09', 'emma-obs-b12-2024-09'],
    'Vitamin D 22 ng/mL - low/insufficient, likely contributing to fatigue. B12 normal. Start cholecalciferol 2000 IU daily.',
    'Quest'
  ),

  // November 2024 - Follow-up
  createDiagnosticReport(
    'emma-dr-cmp-2024-11',
    'emma',
    'Emma L.',
    '24323-8',
    'Comprehensive Metabolic Panel',
    '2024-11-01',
    ['emma-obs-glucose-2024-11'],
    'Fasting glucose 86 mg/dL - normal. Metabolic panel unremarkable.',
    'Quest'
  ),
  createDiagnosticReport(
    'emma-dr-vitamins-2024-11',
    'emma',
    'Emma L.',
    '2132-9',
    'Vitamin Panel',
    '2024-11-01',
    ['emma-obs-vitd-2024-11', 'emma-obs-iron-2024-11', 'emma-obs-ferritin-2024-11'],
    'Vitamin D 28 ng/mL - improving but still insufficient, continue supplementation. Iron studies normal. Patient reports better energy with wearable-guided activity improvements.',
    'Quest'
  ),
  createDiagnosticReport(
    'emma-dr-lipid-2024-11',
    'emma',
    'Emma L.',
    '24331-1',
    'Lipid Panel',
    '2024-11-01',
    [
      'emma-obs-cholesterol-2024-11',
      'emma-obs-ldl-2024-11',
      'emma-obs-hdl-2024-11',
      'emma-obs-trig-2024-11',
    ],
    'Lipid panel normal for age. Total cholesterol 172, LDL 95, HDL 58, Triglycerides 95. No intervention needed.'
  ),
];

// ============================================================================
// Export all diagnostic reports
// ============================================================================

export const allDiagnosticReports: FhirDiagnosticReport[] = [
  ...rajanDiagnosticReports,
  ...sarahDiagnosticReports,
  ...marcusDiagnosticReports,
  ...emmaDiagnosticReports,
];

export function getDiagnosticReportsForPersona(
  personaId: string
): FhirDiagnosticReport[] {
  switch (personaId) {
    case 'rajan':
      return rajanDiagnosticReports;
    case 'sarah':
      return sarahDiagnosticReports;
    case 'marcus':
      return marcusDiagnosticReports;
    case 'emma':
      return emmaDiagnosticReports;
    default:
      return [];
  }
}

export function getDiagnosticReportById(
  id: string
): FhirDiagnosticReport | undefined {
  return allDiagnosticReports.find((dr) => dr.id === id);
}

export function getRecentDiagnosticReports(
  personaId: string,
  limit: number = 5
): FhirDiagnosticReport[] {
  return getDiagnosticReportsForPersona(personaId)
    .sort(
      (a, b) =>
        new Date(b.effectiveDateTime || '').getTime() -
        new Date(a.effectiveDateTime || '').getTime()
    )
    .slice(0, limit);
}

export function getDiagnosticReportsByType(
  personaId: string,
  loincCode: string
): FhirDiagnosticReport[] {
  return getDiagnosticReportsForPersona(personaId).filter(
    (dr) => dr.code.coding?.[0]?.code === loincCode
  );
}

export function getDiagnosticReportWithObservations(
  reportId: string,
  allObservations: { id: string }[]
): {
  report: FhirDiagnosticReport | undefined;
  observations: { id: string }[];
} {
  const report = getDiagnosticReportById(reportId);
  if (!report) {
    return { report: undefined, observations: [] };
  }

  const observationIds =
    report.result?.map((ref) => ref.reference?.split('/')[1]) || [];
  const observations = allObservations.filter((obs) =>
    observationIds.includes(obs.id)
  );

  return { report, observations };
}
