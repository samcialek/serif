// Client Data Models for Serif Platform
// Enterprise client: Human Edge (comprehensive metabolic health)

// ============================================================================
// Data Sources & Ingestion Paths
// ============================================================================

export type DataSourceType =
  // Human Edge sources
  | 'pathology-lab' // Thyrocare, Metropolis - blood biomarkers
  | 'terra-api' // Wearable aggregator (Apple, Fitbit, Garmin, Oura)
  | 'ble-device' // Connected medical devices (CGM, BP, scale)
  | 'self-report' // Onboarding forms, weekly surveys
  | 'intervention' // Clinician-assigned interventions
  | 'compliance' // Adherence/completion tracking
  | 'environment' // Weather, AQI, daylight
  | 'engagement'; // Push/click telemetry

export type IngestionCadence =
  | 'real-time'
  | 'continuous' // Sensor data aggregated to buckets
  | 'daily'
  | 'weekly'
  | 'event-based' // User-triggered or system event
  | 'quarterly'; // e.g., lab draws

export interface DataSource {
  id: string;
  type: DataSourceType;
  name: string;
  description: string;
  cadence: IngestionCadence;
  pipeline: string; // Description of ingestion path
  lastSync?: string;
  status: 'active' | 'pending' | 'error';
  recordCount?: number;
}

// ============================================================================
// HUMAN EDGE - Comprehensive Health Platform
// ============================================================================

// 1. Laboratory / Blood Biomarkers
export interface LabBiomarker {
  id: string;
  code: string; // LOINC-like code
  name: string;
  category:
    | 'metabolic'
    | 'lipid'
    | 'inflammatory'
    | 'thyroid'
    | 'vitamin'
    | 'hormone'
    | 'hematology'
    | 'liver'
    | 'kidney';
  value: number;
  unit: string;
  referenceRange: { low: number; high: number };
  interpretation: 'optimal' | 'normal' | 'borderline' | 'high' | 'low' | 'critical';
  collectionDate: string;
  source: string; // Lab name
  pdfUrl?: string;
}

// 2. Digital Biomarkers - Wearables (Terra API)
export interface WearableMetric {
  id: string;
  timestamp: string;
  source: 'apple_watch' | 'fitbit' | 'garmin' | 'oura' | 'whoop';
  metrics: {
    // Activity
    steps?: number;
    activeEnergy?: number; // kcal
    floors?: number;
    workoutMinutes?: number;
    workoutType?: string;
    // Sleep
    sleepDuration?: number; // minutes
    deepSleep?: number;
    remSleep?: number;
    lightSleep?: number;
    awakeTime?: number;
    sleepScore?: number;
    // Heart
    restingHR?: number;
    hrv?: number; // ms RMSSD
    avgHR?: number;
    maxHR?: number;
    // Other
    respirationRate?: number;
    spo2?: number;
    skinTemp?: number;
    stress?: number; // 0-100
    bodyBattery?: number;
    vo2Max?: number;
    trainingLoad?: number;
  };
}

// 3. Connected Medical Devices
export interface MedicalDeviceReading {
  id: string;
  deviceType: 'cgm' | 'bp_monitor' | 'scale' | 'pulse_ox';
  timestamp: string;
  source: 'withings' | 'omron' | 'abbott_libre' | 'dexcom' | 'generic_ble';
  readings: {
    // CGM
    glucose?: number; // mg/dL
    glucoseTrend?: 'rising_fast' | 'rising' | 'stable' | 'falling' | 'falling_fast';
    timeInRange?: number; // percentage
    timeAboveRange?: number;
    timeBelowRange?: number;
    // BP
    systolic?: number;
    diastolic?: number;
    pulse?: number;
    // Scale
    weight?: number; // kg
    bodyFat?: number; // percentage
    muscleMass?: number;
    boneMass?: number;
    waterPercentage?: number;
    // Pulse Ox
    spo2?: number;
    perfusionIndex?: number;
  };
}

// 4. Profile & Lifestyle Self-Report
export interface UserProfile {
  id: string;
  demographics: {
    age: number;
    sex: 'male' | 'female' | 'other';
    height: number; // cm
    waistCircumference?: number; // cm
  };
  lifestyle: {
    dietType: 'omnivore' | 'vegetarian' | 'vegan' | 'keto' | 'mediterranean' | 'other';
    caffeineUnits: number; // per day
    alcoholUnits: number; // per week
    smokingStatus: 'never' | 'former' | 'current';
    exerciseFrequency: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  };
  healthGoals: string[];
  medications: string[];
  conditions: string[];
  surgeries: string[];
}

export interface WeeklySurvey {
  id: string;
  userId: string;
  weekOf: string;
  responses: {
    sleepQuality: 1 | 2 | 3 | 4 | 5;
    stressLevel: 1 | 2 | 3 | 4 | 5;
    energyLevel: 1 | 2 | 3 | 4 | 5;
    mood: 1 | 2 | 3 | 4 | 5;
    adherenceNotes?: string;
  };
}

// 5. Intervention Catalogue
export interface Intervention {
  code: string;
  category:
    | 'nutrition'
    | 'exercise'
    | 'sleep'
    | 'supplement'
    | 'stress'
    | 'medication'
    | 'monitoring';
  name: string;
  description: string;
  intensity: 'low' | 'moderate' | 'high';
  targetBiomarkers: string[]; // Biomarker codes this targets
  duration?: string; // e.g., "12 weeks"
  frequency?: string; // e.g., "daily", "3x/week"
}

export interface InterventionAssignment {
  id: string;
  userId: string;
  interventionCode: string;
  intervention: Intervention;
  assignedBy: string; // Clinician ID
  startDate: string;
  endDate?: string;
  status: 'active' | 'completed' | 'discontinued';
  notes?: string;
}

// 6. Compliance & Behavior Logs
export interface ComplianceLog {
  id: string;
  userId: string;
  interventionId: string;
  date: string;
  completed: boolean;
  completionPercentage: number;
  detectionMethod: 'passive_wearable' | 'manual_confirmation' | 'auto_inferred';
  notes?: string;
}

// 7. Environmental Context
export interface EnvironmentalContext {
  id: string;
  date: string;
  location: { lat: number; lng: number; city: string };
  weather: {
    tempC: number;
    humidity: number;
    conditions: string;
  };
  aqi: number;
  aqiCategory: 'good' | 'moderate' | 'unhealthy_sensitive' | 'unhealthy' | 'hazardous';
  daylightHours: number;
  uvIndex: number;
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface ClientConfig {
  id: string;
  name: string;
  logo?: string;
  description: string;
  dataSources: DataSource[];
  xVariables: XVariable[];
  yVariables: YVariable[];
  insights: ClientInsight[];
  users: ClientUser[];
}

export interface XVariable {
  id: string;
  name: string;
  category: string;
  dataSource: DataSourceType;
  unit?: string;
  description: string;
  sampleRate: string; // e.g., "96/day" for CGM, "daily" for steps
}

export interface YVariable {
  id: string;
  name: string;
  category: string;
  description: string;
  targetDirection: 'increase' | 'decrease' | 'maintain' | 'optimize';
  unit?: string;
}

export interface ClientInsight {
  id: string;
  title: string;
  description: string;
  xVariables: string[]; // IDs
  yVariable: string; // ID
  modelType: 'causal' | 'predictive' | 'descriptive';
  confidence: number;
  theta?: number; // Threshold
  beta?: number; // Effect size
  recommendation?: string;
  linkedResources?: string[]; // Resource IDs (labs, wearable data, etc.)
}

export interface ClientUser {
  id: string;
  name: string;
  avatar?: string;
  enrollmentDate: string;
  activeDays: number;
  complianceRate: number;
  currentPhase: string;
  tags: string[];
  dataSources?: string[];
  insightCount?: number;
}

// ============================================================================
// Unified Resource Type (FHIR-analogous)
// ============================================================================

export type ResourceType =
  | 'LabBiomarker'
  | 'WearableMetric'
  | 'MedicalDeviceReading'
  | 'UserProfile'
  | 'WeeklySurvey'
  | 'Intervention'
  | 'InterventionAssignment'
  | 'ComplianceLog'
  | 'EnvironmentalContext';

export interface BaseResource {
  id: string;
  resourceType: ResourceType;
  meta?: {
    lastUpdated: string;
    source: DataSourceType;
  };
}

// Type guards
export function isLabBiomarker(r: BaseResource): r is LabBiomarker & BaseResource {
  return r.resourceType === 'LabBiomarker';
}

export function isWearableMetric(r: BaseResource): r is WearableMetric & BaseResource {
  return r.resourceType === 'WearableMetric';
}
