// FHIR R4 Type Definitions for Serif Platform
// Simplified but structurally accurate representations

// ============================================================================
// FHIR Primitive Types
// ============================================================================

export type FhirResourceType =
  | 'Patient'
  | 'Condition'
  | 'Observation'
  | 'MedicationStatement'
  | 'Encounter'
  | 'DiagnosticReport';

export type FhirStatus = 'active' | 'inactive' | 'resolved' | 'final' | 'preliminary' | 'amended';

// ============================================================================
// FHIR Complex Types
// ============================================================================

export interface Coding {
  system: string;
  code: string;
  display: string;
}

export interface CodeableConcept {
  coding: Coding[];
  text?: string;
}

export interface Reference {
  reference: string;
  display?: string;
}

export interface Quantity {
  value: number;
  unit: string;
  system?: string;
  code?: string;
}

export interface Range {
  low?: Quantity;
  high?: Quantity;
}

export interface Period {
  start: string;
  end?: string;
}

export interface Annotation {
  text: string;
  time?: string;
  authorString?: string;
}

// ============================================================================
// FHIR Base Resource
// ============================================================================

export interface FhirResource {
  resourceType: FhirResourceType;
  id: string;
  meta?: {
    lastUpdated: string;
    source?: string;
    versionId?: string;
  };
}

// ============================================================================
// Condition Resource (Diagnoses)
// ============================================================================

export interface FhirCondition extends FhirResource {
  resourceType: 'Condition';
  clinicalStatus: CodeableConcept;
  verificationStatus: CodeableConcept;
  category?: CodeableConcept[];
  severity?: CodeableConcept;
  code: CodeableConcept;
  subject: Reference;
  onsetDateTime?: string;
  onsetAge?: { value: number; unit: string };
  abatementDateTime?: string;
  recordedDate: string;
  recorder?: Reference;
  note?: Annotation[];

  // Serif extensions
  _serifLinkedInsights?: string[];
  _serifSource?: 'CommonWell' | 'Carequality' | 'Manual' | 'Zus';
}

// ============================================================================
// Observation Resource (Labs, Vitals)
// ============================================================================

export interface FhirObservation extends FhirResource {
  resourceType: 'Observation';
  status: 'final' | 'preliminary' | 'amended' | 'corrected' | 'cancelled';
  category: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  effectiveDateTime: string;
  issued?: string;
  performer?: Reference[];
  valueQuantity?: Quantity;
  valueString?: string;
  valueBoolean?: boolean;
  valueCodeableConcept?: CodeableConcept;
  dataAbsentReason?: CodeableConcept;
  interpretation?: CodeableConcept[];
  referenceRange?: {
    low?: Quantity;
    high?: Quantity;
    type?: CodeableConcept;
    text?: string;
  }[];
  note?: Annotation[];

  // Serif extensions
  _serifTrend?: 'improving' | 'stable' | 'declining';
  _serifSource?: 'Quest' | 'Labcorp' | 'CommonWell' | 'Carequality' | 'Wearable';
  _serifLinkedInsights?: string[];
}

// ============================================================================
// MedicationStatement Resource
// ============================================================================

export interface FhirMedicationStatement extends FhirResource {
  resourceType: 'MedicationStatement';
  status: 'active' | 'completed' | 'stopped' | 'on-hold' | 'unknown' | 'not-taken';
  statusReason?: CodeableConcept[];
  category?: CodeableConcept;
  medicationCodeableConcept: CodeableConcept;
  subject: Reference;
  effectivePeriod?: Period;
  effectiveDateTime?: string;
  dateAsserted?: string;
  informationSource?: Reference;
  reasonCode?: CodeableConcept[];
  reasonReference?: Reference[];
  note?: Annotation[];
  dosage?: {
    text?: string;
    timing?: {
      repeat?: {
        frequency?: number;
        period?: number;
        periodUnit?: string;
      };
      code?: CodeableConcept;
    };
    route?: CodeableConcept;
    doseAndRate?: {
      doseQuantity?: Quantity;
    }[];
  }[];

  // Serif extensions
  _serifAdherence?: number; // 0-100 percentage
  _serifSource?: 'Surescripts' | 'Manual' | 'EHR';
  _serifLastFill?: string;
  _serifNextRefill?: string;
}

// ============================================================================
// Encounter Resource (Visits, ADT)
// ============================================================================

export interface FhirEncounter extends FhirResource {
  resourceType: 'Encounter';
  status: 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled';
  class: Coding;
  type?: CodeableConcept[];
  serviceType?: CodeableConcept;
  priority?: CodeableConcept;
  subject: Reference;
  participant?: {
    type?: CodeableConcept[];
    individual?: Reference;
  }[];
  period?: Period;
  reasonCode?: CodeableConcept[];
  reasonReference?: Reference[];
  diagnosis?: {
    condition: Reference;
    use?: CodeableConcept;
    rank?: number;
  }[];
  hospitalization?: {
    admitSource?: CodeableConcept;
    dischargeDisposition?: CodeableConcept;
  };
  location?: {
    location: Reference;
    status?: string;
    period?: Period;
  }[];
  serviceProvider?: Reference;

  // Serif extensions
  _serifEncounterType?: 'pcp-visit' | 'specialist' | 'ed-visit' | 'inpatient' | 'telehealth' | 'lab-draw';
  _serifSource?: 'Bamboo' | 'Collective' | 'CommonWell' | 'Carequality';
  _serifAdtType?: 'A01' | 'A02' | 'A03' | 'A04' | 'A08'; // ADT message types
}

// ============================================================================
// DiagnosticReport Resource (Lab Panels)
// ============================================================================

export interface FhirDiagnosticReport extends FhirResource {
  resourceType: 'DiagnosticReport';
  status: 'registered' | 'partial' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  effectivePeriod?: Period;
  issued?: string;
  performer?: Reference[];
  result?: Reference[];
  conclusion?: string;
  conclusionCode?: CodeableConcept[];
  presentedForm?: {
    contentType?: string;
    url?: string;
    title?: string;
  }[];

  // Serif extensions
  _serifSource?: 'Quest' | 'Labcorp' | 'Hospital Lab';
  _serifLinkedObservations?: string[]; // IDs of related Observations
}

// ============================================================================
// Common Code Systems
// ============================================================================

export const CODE_SYSTEMS = {
  ICD10: 'http://hl7.org/fhir/sid/icd-10-cm',
  LOINC: 'http://loinc.org',
  SNOMED: 'http://snomed.info/sct',
  RXNORM: 'http://www.nlm.nih.gov/research/umls/rxnorm',
  CPT: 'http://www.ama-assn.org/go/cpt',
  NDC: 'http://hl7.org/fhir/sid/ndc',
  UCUM: 'http://unitsofmeasure.org',
  ENCOUNTER_CLASS: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  CONDITION_CLINICAL: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
  CONDITION_VERIFICATION: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
  OBSERVATION_CATEGORY: 'http://terminology.hl7.org/CodeSystem/observation-category',
} as const;

// ============================================================================
// Common LOINC Codes for Labs
// ============================================================================

export const LOINC_CODES = {
  // ============================================================================
  // GLUCOSE & METABOLIC PANEL (~8 markers)
  // ============================================================================
  GLUCOSE_FASTING: { code: '1558-6', display: 'Fasting glucose', unit: 'mg/dL', category: 'metabolic' },
  GLUCOSE_RANDOM: { code: '2339-0', display: 'Glucose (random)', unit: 'mg/dL', category: 'metabolic' },
  HBA1C: { code: '4548-4', display: 'Hemoglobin A1c', unit: '%', category: 'metabolic' },
  INSULIN_FASTING: { code: '2484-4', display: 'Fasting insulin', unit: 'mIU/L', category: 'metabolic' },
  HOMA_IR: { code: '98979-8', display: 'HOMA-IR (insulin resistance)', unit: 'ratio', category: 'metabolic' },
  C_PEPTIDE: { code: '1986-9', display: 'C-peptide', unit: 'ng/mL', category: 'metabolic' },
  FRUCTOSAMINE: { code: '1757-4', display: 'Fructosamine', unit: 'umol/L', category: 'metabolic' },
  ADIPONECTIN: { code: '56661-6', display: 'Adiponectin', unit: 'ug/mL', category: 'metabolic' },

  // ============================================================================
  // LIPID PANEL - EXTENDED (~10 markers)
  // ============================================================================
  CHOLESTEROL_TOTAL: { code: '2093-3', display: 'Total cholesterol', unit: 'mg/dL', category: 'lipids' },
  TRIGLYCERIDES: { code: '2571-8', display: 'Triglycerides', unit: 'mg/dL', category: 'lipids' },
  HDL: { code: '2085-9', display: 'HDL cholesterol', unit: 'mg/dL', category: 'lipids' },
  LDL: { code: '2089-1', display: 'LDL cholesterol', unit: 'mg/dL', category: 'lipids' },
  LDL_DIRECT: { code: '18262-6', display: 'LDL cholesterol (direct)', unit: 'mg/dL', category: 'lipids' },
  VLDL: { code: '13458-5', display: 'VLDL cholesterol', unit: 'mg/dL', category: 'lipids' },
  APO_B: { code: '1884-6', display: 'Apolipoprotein B', unit: 'mg/dL', category: 'lipids' },
  APO_A1: { code: '1869-7', display: 'Apolipoprotein A-I', unit: 'mg/dL', category: 'lipids' },
  LP_A: { code: '10835-7', display: 'Lipoprotein(a)', unit: 'nmol/L', category: 'lipids' },
  NON_HDL: { code: '43396-1', display: 'Non-HDL cholesterol', unit: 'mg/dL', category: 'lipids' },

  // ============================================================================
  // LIVER FUNCTION PANEL (~8 markers)
  // ============================================================================
  ALT: { code: '1742-6', display: 'ALT (SGPT)', unit: 'U/L', category: 'liver' },
  AST: { code: '1920-8', display: 'AST (SGOT)', unit: 'U/L', category: 'liver' },
  GGT: { code: '2324-2', display: 'GGT (Gamma GT)', unit: 'U/L', category: 'liver' },
  ALP: { code: '6768-6', display: 'Alkaline phosphatase', unit: 'U/L', category: 'liver' },
  BILIRUBIN_TOTAL: { code: '1975-2', display: 'Total bilirubin', unit: 'mg/dL', category: 'liver' },
  BILIRUBIN_DIRECT: { code: '1968-7', display: 'Direct bilirubin', unit: 'mg/dL', category: 'liver' },
  ALBUMIN: { code: '1751-7', display: 'Albumin', unit: 'g/dL', category: 'liver' },
  TOTAL_PROTEIN: { code: '2885-2', display: 'Total protein', unit: 'g/dL', category: 'liver' },

  // ============================================================================
  // KIDNEY / RENAL PANEL (~6 markers)
  // ============================================================================
  CREATININE: { code: '2160-0', display: 'Creatinine', unit: 'mg/dL', category: 'kidney' },
  BUN: { code: '3094-0', display: 'BUN (Blood urea nitrogen)', unit: 'mg/dL', category: 'kidney' },
  EGFR: { code: '33914-3', display: 'eGFR', unit: 'mL/min/1.73m2', category: 'kidney' },
  BUN_CREAT_RATIO: { code: '3097-3', display: 'BUN/Creatinine ratio', unit: 'ratio', category: 'kidney' },
  URIC_ACID: { code: '3084-1', display: 'Uric acid', unit: 'mg/dL', category: 'kidney' },
  CYSTATIN_C: { code: '33863-2', display: 'Cystatin C', unit: 'mg/L', category: 'kidney' },

  // ============================================================================
  // ELECTROLYTES (~6 markers)
  // ============================================================================
  SODIUM: { code: '2951-2', display: 'Sodium', unit: 'mEq/L', category: 'electrolytes' },
  POTASSIUM: { code: '2823-3', display: 'Potassium', unit: 'mEq/L', category: 'electrolytes' },
  CHLORIDE: { code: '2075-0', display: 'Chloride', unit: 'mEq/L', category: 'electrolytes' },
  BICARBONATE: { code: '1963-8', display: 'Bicarbonate (CO2)', unit: 'mEq/L', category: 'electrolytes' },
  CALCIUM: { code: '17861-6', display: 'Calcium', unit: 'mg/dL', category: 'electrolytes' },
  PHOSPHORUS: { code: '2777-1', display: 'Phosphorus', unit: 'mg/dL', category: 'electrolytes' },
  MAGNESIUM: { code: '2601-3', display: 'Magnesium', unit: 'mg/dL', category: 'electrolytes' },

  // ============================================================================
  // COMPLETE BLOOD COUNT (CBC) (~12 markers)
  // ============================================================================
  WBC: { code: '6690-2', display: 'WBC (White blood cells)', unit: 'K/uL', category: 'cbc' },
  RBC: { code: '789-8', display: 'RBC (Red blood cells)', unit: 'M/uL', category: 'cbc' },
  HEMOGLOBIN: { code: '718-7', display: 'Hemoglobin', unit: 'g/dL', category: 'cbc' },
  HEMATOCRIT: { code: '4544-3', display: 'Hematocrit', unit: '%', category: 'cbc' },
  MCV: { code: '787-2', display: 'MCV (Mean corpuscular volume)', unit: 'fL', category: 'cbc' },
  MCH: { code: '785-6', display: 'MCH (Mean corpuscular Hgb)', unit: 'pg', category: 'cbc' },
  MCHC: { code: '786-4', display: 'MCHC', unit: 'g/dL', category: 'cbc' },
  RDW: { code: '788-0', display: 'RDW (Red cell distribution)', unit: '%', category: 'cbc' },
  PLATELETS: { code: '777-3', display: 'Platelets', unit: 'K/uL', category: 'cbc' },
  MPV: { code: '32623-1', display: 'MPV (Mean platelet volume)', unit: 'fL', category: 'cbc' },
  NEUTROPHILS: { code: '751-8', display: 'Neutrophils', unit: '%', category: 'cbc' },
  LYMPHOCYTES: { code: '731-0', display: 'Lymphocytes', unit: '%', category: 'cbc' },

  // ============================================================================
  // INFLAMMATORY MARKERS (~6 markers)
  // ============================================================================
  CRP_HS: { code: '30522-7', display: 'hs-CRP (High sensitivity)', unit: 'mg/L', category: 'inflammation' },
  ESR: { code: '4537-7', display: 'ESR (Sed rate)', unit: 'mm/hr', category: 'inflammation' },
  HOMOCYSTEINE: { code: '13965-9', display: 'Homocysteine', unit: 'umol/L', category: 'inflammation' },
  FIBRINOGEN: { code: '3255-7', display: 'Fibrinogen', unit: 'mg/dL', category: 'inflammation' },
  IL6: { code: '26881-3', display: 'Interleukin-6 (IL-6)', unit: 'pg/mL', category: 'inflammation' },
  TNF_ALPHA: { code: '30534-2', display: 'TNF-alpha', unit: 'pg/mL', category: 'inflammation' },

  // ============================================================================
  // THYROID PANEL (~6 markers)
  // ============================================================================
  TSH: { code: '3016-3', display: 'TSH', unit: 'mIU/L', category: 'thyroid' },
  T4_FREE: { code: '3024-7', display: 'Free T4', unit: 'ng/dL', category: 'thyroid' },
  T3_FREE: { code: '3051-0', display: 'Free T3', unit: 'pg/mL', category: 'thyroid' },
  T3_REVERSE: { code: '3050-2', display: 'Reverse T3', unit: 'ng/dL', category: 'thyroid' },
  TPO_ANTIBODY: { code: '5385-0', display: 'TPO antibodies', unit: 'IU/mL', category: 'thyroid' },
  THYROGLOBULIN_AB: { code: '5379-3', display: 'Thyroglobulin antibodies', unit: 'IU/mL', category: 'thyroid' },

  // ============================================================================
  // VITAMINS & MINERALS (~8 markers)
  // ============================================================================
  VITAMIN_D: { code: '1989-3', display: 'Vitamin D (25-OH)', unit: 'ng/mL', category: 'vitamins' },
  B12: { code: '2132-9', display: 'Vitamin B12', unit: 'pg/mL', category: 'vitamins' },
  FOLATE: { code: '2284-8', display: 'Folate (Folic acid)', unit: 'ng/mL', category: 'vitamins' },
  VITAMIN_B6: { code: '2498-4', display: 'Vitamin B6', unit: 'ng/mL', category: 'vitamins' },
  ZINC: { code: '2601-3', display: 'Zinc', unit: 'ug/dL', category: 'vitamins' },
  SELENIUM: { code: '2823-3', display: 'Selenium', unit: 'ug/L', category: 'vitamins' },
  COPPER: { code: '2508-0', display: 'Copper', unit: 'ug/dL', category: 'vitamins' },
  VITAMIN_A: { code: '2923-1', display: 'Vitamin A (Retinol)', unit: 'ug/dL', category: 'vitamins' },

  // ============================================================================
  // IRON STUDIES (~5 markers)
  // ============================================================================
  IRON: { code: '2498-4', display: 'Iron', unit: 'ug/dL', category: 'iron' },
  FERRITIN: { code: '2276-4', display: 'Ferritin', unit: 'ng/mL', category: 'iron' },
  TIBC: { code: '2500-7', display: 'TIBC (Total iron binding)', unit: 'ug/dL', category: 'iron' },
  TRANSFERRIN: { code: '3034-6', display: 'Transferrin', unit: 'mg/dL', category: 'iron' },
  TRANSFERRIN_SAT: { code: '2502-3', display: 'Transferrin saturation', unit: '%', category: 'iron' },

  // ============================================================================
  // HORMONES (~10 markers)
  // ============================================================================
  TESTOSTERONE: { code: '2986-8', display: 'Testosterone (total)', unit: 'ng/dL', category: 'hormones' },
  TESTOSTERONE_FREE: { code: '2991-8', display: 'Testosterone (free)', unit: 'pg/mL', category: 'hormones' },
  CORTISOL_AM: { code: '2143-6', display: 'Cortisol (AM)', unit: 'ug/dL', category: 'hormones' },
  DHEA_S: { code: '2191-5', display: 'DHEA-Sulfate', unit: 'ug/dL', category: 'hormones' },
  ESTRADIOL: { code: '2243-4', display: 'Estradiol (E2)', unit: 'pg/mL', category: 'hormones' },
  PROGESTERONE: { code: '2839-9', display: 'Progesterone', unit: 'ng/mL', category: 'hormones' },
  LH: { code: '10501-5', display: 'LH (Luteinizing hormone)', unit: 'mIU/mL', category: 'hormones' },
  FSH: { code: '15067-2', display: 'FSH (Follicle stimulating)', unit: 'mIU/mL', category: 'hormones' },
  IGF1: { code: '2484-4', display: 'IGF-1 (Somatomedin C)', unit: 'ng/mL', category: 'hormones' },
  SHBG: { code: '13967-5', display: 'SHBG (Sex hormone binding)', unit: 'nmol/L', category: 'hormones' },

  // ============================================================================
  // CARDIAC MARKERS (~4 markers)
  // ============================================================================
  BNP: { code: '30934-4', display: 'BNP (B-type natriuretic)', unit: 'pg/mL', category: 'cardiac' },
  NT_PROBNP: { code: '33762-6', display: 'NT-proBNP', unit: 'pg/mL', category: 'cardiac' },
  TROPONIN_I: { code: '10839-9', display: 'Troponin I', unit: 'ng/mL', category: 'cardiac' },
  TROPONIN_T: { code: '6598-7', display: 'Troponin T', unit: 'ng/mL', category: 'cardiac' },

  // ============================================================================
  // VITALS & BODY COMPOSITION (~8 markers)
  // ============================================================================
  HEART_RATE: { code: '8867-4', display: 'Heart rate', unit: 'bpm', category: 'vitals' },
  BP_SYSTOLIC: { code: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg', category: 'vitals' },
  BP_DIASTOLIC: { code: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg', category: 'vitals' },
  BODY_WEIGHT: { code: '29463-7', display: 'Body weight', unit: 'kg', category: 'vitals' },
  BMI: { code: '39156-5', display: 'Body mass index (BMI)', unit: 'kg/m2', category: 'vitals' },
  WAIST_CIRC: { code: '56086-2', display: 'Waist circumference', unit: 'cm', category: 'vitals' },
  BODY_FAT_PCT: { code: '41982-0', display: 'Body fat percentage', unit: '%', category: 'vitals' },
  RESPIRATORY_RATE: { code: '9279-1', display: 'Respiratory rate', unit: '/min', category: 'vitals' },
} as const;

// Total: 78 biomarkers organized by category

// ============================================================================
// Common ICD-10 Codes
// ============================================================================

export const ICD10_CODES = {
  // Diabetes & Metabolic
  PREDIABETES: { code: 'R73.03', display: 'Prediabetes' },
  T2DM: { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications' },
  T2DM_CONTROLLED: { code: 'E11.65', display: 'Type 2 diabetes mellitus with hyperglycemia' },
  HYPERLIPIDEMIA: { code: 'E78.5', display: 'Hyperlipidemia, unspecified' },
  OBESITY: { code: 'E66.9', display: 'Obesity, unspecified' },

  // Cardiovascular
  HYPERTENSION: { code: 'I10', display: 'Essential (primary) hypertension' },
  HYPERTENSION_CONTROLLED: { code: 'I10', display: 'Essential hypertension, controlled' },

  // Sleep
  INSOMNIA: { code: 'G47.00', display: 'Insomnia, unspecified' },
  SLEEP_APNEA: { code: 'G47.33', display: 'Obstructive sleep apnea' },

  // Mental Health
  ANXIETY_GAD: { code: 'F41.1', display: 'Generalized anxiety disorder' },
  ANXIETY_UNSPECIFIED: { code: 'F41.9', display: 'Anxiety disorder, unspecified' },
  DEPRESSION: { code: 'F32.9', display: 'Major depressive disorder, single episode, unspecified' },

  // Musculoskeletal
  OSTEOARTHRITIS: { code: 'M19.90', display: 'Unspecified osteoarthritis, unspecified site' },
  CHRONIC_PAIN: { code: 'G89.29', display: 'Other chronic pain' },

  // GI
  GERD: { code: 'K21.0', display: 'Gastro-esophageal reflux disease with esophagitis' },

  // Other
  VITAMIN_D_DEFICIENCY: { code: 'E55.9', display: 'Vitamin D deficiency, unspecified' },
  TENSION_HEADACHE: { code: 'G44.2', display: 'Tension-type headache' },
  FATIGUE: { code: 'R53.83', display: 'Other fatigue' },
} as const;

// ============================================================================
// Interpretation Codes
// ============================================================================

export const INTERPRETATION_CODES = {
  NORMAL: { code: 'N', display: 'Normal', color: 'green' },
  HIGH: { code: 'H', display: 'High', color: 'red' },
  LOW: { code: 'L', display: 'Low', color: 'yellow' },
  CRITICAL_HIGH: { code: 'HH', display: 'Critical high', color: 'red' },
  CRITICAL_LOW: { code: 'LL', display: 'Critical low', color: 'red' },
  ABNORMAL: { code: 'A', display: 'Abnormal', color: 'yellow' },
  BORDERLINE: { code: 'borderline', display: 'Borderline', color: 'yellow' },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

export function createCodeableConcept(
  system: string,
  code: string,
  display: string,
  text?: string
): CodeableConcept {
  return {
    coding: [{ system, code, display }],
    text: text || display,
  };
}

export function createReference(resourceType: string, id: string, display?: string): Reference {
  return {
    reference: `${resourceType}/${id}`,
    display,
  };
}

export function createQuantity(value: number, unit: string, code?: string): Quantity {
  return {
    value,
    unit,
    system: CODE_SYSTEMS.UCUM,
    code: code || unit,
  };
}

export function getInterpretation(
  value: number,
  lowNormal: number,
  highNormal: number,
  lowCritical?: number,
  highCritical?: number
): typeof INTERPRETATION_CODES[keyof typeof INTERPRETATION_CODES] {
  if (highCritical && value >= highCritical) return INTERPRETATION_CODES.CRITICAL_HIGH;
  if (lowCritical && value <= lowCritical) return INTERPRETATION_CODES.CRITICAL_LOW;
  if (value > highNormal) return INTERPRETATION_CODES.HIGH;
  if (value < lowNormal) return INTERPRETATION_CODES.LOW;
  return INTERPRETATION_CODES.NORMAL;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isCondition(resource: FhirResource): resource is FhirCondition {
  return resource.resourceType === 'Condition';
}

export function isObservation(resource: FhirResource): resource is FhirObservation {
  return resource.resourceType === 'Observation';
}

export function isMedicationStatement(resource: FhirResource): resource is FhirMedicationStatement {
  return resource.resourceType === 'MedicationStatement';
}

export function isEncounter(resource: FhirResource): resource is FhirEncounter {
  return resource.resourceType === 'Encounter';
}

export function isDiagnosticReport(resource: FhirResource): resource is FhirDiagnosticReport {
  return resource.resourceType === 'DiagnosticReport';
}

// ============================================================================
// Display Helpers
// ============================================================================

export function getConditionStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'red';
    case 'resolved': return 'green';
    case 'inactive': return 'gray';
    default: return 'gray';
  }
}

export function getObservationInterpretationColor(interpretation?: CodeableConcept[]): string {
  if (!interpretation || interpretation.length === 0) return 'gray';
  const code = interpretation[0].coding[0]?.code;
  switch (code) {
    case 'N': return 'green';
    case 'H':
    case 'HH': return 'red';
    case 'L':
    case 'LL': return 'yellow';
    case 'A': return 'orange';
    default: return 'gray';
  }
}

export function formatFhirDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatFhirDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
