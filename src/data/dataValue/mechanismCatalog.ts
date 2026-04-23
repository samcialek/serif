/**
 * Static mechanism catalog transcribed from Python inference engine.
 * Sources: edge_discovery.py, backdoor.py
 */
import type {
  DoseFamilyDef,
  ResponseFamilyDef,
  MechanismDef,
  StructuralEdge,
  MechanismCatalogData,
} from './types'

// ═══════════════════════════════════════════════════════════════════
// DOSE FAMILIES (22 entries from edge_discovery.py)
// ═══════════════════════════════════════════════════════════════════

export const DOSE_FAMILIES: Record<string, DoseFamilyDef> = {
  running_volume: {
    id: 'running_volume', label: 'Running Volume',
    columns: ['daily_run_km', 'run_distance_km', 'distance_walking_running_km'],
    unit: 'km', compleCategory: 'C',
  },
  training_duration: {
    id: 'training_duration', label: 'Training Duration',
    columns: ['daily_duration_min', 'workout_duration_min', 'ah_workout_duration_min', 'exercise_time_min'],
    unit: 'min', compleCategory: 'C',
  },
  zone2_volume: {
    id: 'zone2_volume', label: 'Zone 2 Volume',
    columns: ['daily_zone2_min', 'zone2_minutes'],
    unit: 'min', compleCategory: 'C',
  },
  total_distance: {
    id: 'total_distance', label: 'Total Distance',
    columns: ['daily_distance_km', 'distance_walking_running_km'],
    unit: 'km', compleCategory: 'C',
  },
  active_energy: {
    id: 'active_energy', label: 'Active Energy',
    columns: ['active_energy_kcal', 'ah_workout_energy_kcal'],
    unit: 'kcal', compleCategory: 'C',
  },
  daily_steps: {
    id: 'daily_steps', label: 'Daily Steps',
    columns: ['steps'],
    unit: 'steps', compleCategory: 'C',
  },
  training_load: {
    id: 'training_load', label: 'Training Load (TRIMP)',
    columns: ['daily_trimp'],
    unit: 'TRIMP', compleCategory: 'C',
  },
  workout_end_time: {
    id: 'workout_end_time', label: 'Workout End Time',
    columns: ['last_workout_end_hour', 'latest_workout_hour'],
    unit: 'hour', compleCategory: 'C',
  },
  bedtime: {
    id: 'bedtime', label: 'Bedtime',
    columns: ['bedtime_hour'],
    unit: 'hour', compleCategory: 'C',
  },
  acwr: {
    id: 'acwr', label: 'ACWR',
    columns: ['acwr'],
    unit: 'ratio', compleCategory: 'L',
  },
  training_consistency: {
    id: 'training_consistency', label: 'Training Consistency',
    columns: ['training_consistency', 'training_consistency_90d'],
    unit: 'fraction', compleCategory: 'L',
  },
  sleep_debt: {
    id: 'sleep_debt', label: 'Sleep Debt',
    columns: ['sleep_debt_14d'],
    unit: 'hours deficit', compleCategory: 'L',
  },
  sleep_duration: {
    id: 'sleep_duration', label: 'Sleep Duration',
    columns: ['sleep_duration_hrs'],
    unit: 'hours', compleCategory: 'C',
  },
  travel_load: {
    id: 'travel_load', label: 'Travel/Jet Lag Load',
    columns: ['travel_load'],
    unit: 'jet lag score', compleCategory: 'L',
  },
  dietary_protein: {
    id: 'dietary_protein', label: 'Dietary Protein',
    columns: ['dietary_protein_g'],
    unit: 'g', compleCategory: 'C',
  },
  dietary_energy: {
    id: 'dietary_energy', label: 'Dietary Energy',
    columns: ['dietary_energy_kcal'],
    unit: 'kcal', compleCategory: 'C',
  },
  iron_sat_level: {
    id: 'iron_sat_level', label: 'Iron Saturation',
    columns: ['iron_saturation_pct_smoothed', 'iron_saturation_pct_computed_smoothed'],
    unit: '%', compleCategory: 'M',
  },
  vitamin_d_level: {
    id: 'vitamin_d_level', label: 'Vitamin D Level',
    columns: ['vitamin_d_smoothed', 'vitamin_d_raw'],
    unit: 'ng/mL', compleCategory: 'M',
  },
  omega3_level: {
    id: 'omega3_level', label: 'Omega-3 Index',
    columns: ['omega3_index_derived', 'omega3_index_smoothed'],
    unit: '%', compleCategory: 'M',
  },
  b12_level: {
    id: 'b12_level', label: 'B12 Level',
    columns: ['b12_smoothed', 'b12_raw'],
    unit: 'pg/mL', compleCategory: 'M',
  },
  homocysteine_level: {
    id: 'homocysteine_level', label: 'Homocysteine Level',
    columns: ['homocysteine_smoothed', 'homocysteine_raw'],
    unit: 'umol/L', compleCategory: 'M',
  },
  ferritin_level: {
    id: 'ferritin_level', label: 'Ferritin Level',
    columns: ['ferritin_smoothed', 'ferritin_raw'],
    unit: 'ng/mL', compleCategory: 'M',
  },
}

// ═══════════════════════════════════════════════════════════════════
// RESPONSE FAMILIES (42 entries from edge_discovery.py)
// ═══════════════════════════════════════════════════════════════════

export const RESPONSE_FAMILIES: Record<string, ResponseFamilyDef> = {
  iron_total: {
    id: 'iron_total', label: 'Serum Iron',
    columns: ['iron_total_smoothed', 'iron_total_raw'],
    unit: 'mcg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  ferritin: {
    id: 'ferritin', label: 'Ferritin',
    columns: ['ferritin_smoothed', 'ferritin_raw'],
    unit: 'ng/mL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  hemoglobin: {
    id: 'hemoglobin', label: 'Hemoglobin',
    columns: ['hemoglobin_smoothed', 'hemoglobin_raw'],
    unit: 'g/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  testosterone: {
    id: 'testosterone', label: 'Testosterone',
    columns: ['testosterone_smoothed', 'testosterone_raw'],
    unit: 'ng/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  cortisol: {
    id: 'cortisol', label: 'Cortisol',
    columns: ['cortisol_smoothed', 'cortisol_raw'],
    unit: 'mcg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  triglycerides: {
    id: 'triglycerides', label: 'Triglycerides',
    columns: ['triglycerides_smoothed', 'triglycerides_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  hdl: {
    id: 'hdl', label: 'HDL Cholesterol',
    columns: ['hdl_smoothed', 'hdl_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  ldl: {
    id: 'ldl', label: 'LDL Cholesterol',
    columns: ['ldl_smoothed', 'ldl_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  hscrp: {
    id: 'hscrp', label: 'hs-CRP',
    columns: ['hscrp_smoothed', 'hscrp_raw'],
    unit: 'mg/L', compleCategory: 'M', biologicalTimescale: 'medium',
  },
  vo2peak: {
    id: 'vo2peak', label: 'VO2peak',
    columns: ['vo2_peak_smoothed', 'vo2max_apple'],
    unit: 'ml/min/kg', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  sleep_efficiency: {
    id: 'sleep_efficiency', label: 'Sleep Efficiency',
    columns: ['sleep_efficiency_pct', 'sleep_efficiency_7d'],
    unit: '%', compleCategory: 'O', biologicalTimescale: 'fast',
  },
  sleep_quality: {
    id: 'sleep_quality', label: 'Sleep Quality',
    columns: ['sleep_quality_score'],
    unit: 'min quality', compleCategory: 'O', biologicalTimescale: 'fast',
  },
  deep_sleep: {
    id: 'deep_sleep', label: 'Deep Sleep',
    columns: ['deep_sleep_min', 'ah_deep_sleep_min'],
    unit: 'min', compleCategory: 'O', biologicalTimescale: 'fast',
  },
  sleep_duration_outcome: {
    id: 'sleep_duration_outcome', label: 'Sleep Duration',
    columns: ['sleep_duration_hrs', 'ah_sleep_total_min'],
    unit: 'hrs', compleCategory: 'O', biologicalTimescale: 'fast',
  },
  hrv_daily: {
    id: 'hrv_daily', label: 'Overnight RMSSD',
    columns: ['hrv_daily_mean', 'sleep_hrv_ms', 'hrv_ms'],
    unit: 'ms', compleCategory: 'O', biologicalTimescale: 'fast',
  },
  hrv_baseline: {
    id: 'hrv_baseline', label: 'HRV 7-Day Baseline',
    columns: ['hrv_7d_mean', 'sleep_hrv_7d'],
    unit: 'ms', compleCategory: 'O', biologicalTimescale: 'medium',
  },
  resting_hr: {
    id: 'resting_hr', label: 'Resting Heart Rate',
    columns: ['resting_hr', 'sleep_hr_bpm'],
    unit: 'bpm', compleCategory: 'O', biologicalTimescale: 'fast',
  },
  resting_hr_trend: {
    id: 'resting_hr_trend', label: 'Resting HR 7-Day Avg',
    columns: ['resting_hr_7d_mean', 'sleep_hr_7d'],
    unit: 'bpm', compleCategory: 'O', biologicalTimescale: 'medium',
  },
  body_fat: {
    id: 'body_fat', label: 'Body Fat %',
    columns: ['body_fat_pct'],
    unit: '%', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  body_mass: {
    id: 'body_mass', label: 'Body Mass',
    columns: ['body_mass_kg'],
    unit: 'kg', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  vitamin_d: {
    id: 'vitamin_d', label: 'Vitamin D',
    columns: ['vitamin_d_smoothed', 'vitamin_d_raw'],
    unit: 'ng/mL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  wbc: {
    id: 'wbc', label: 'White Blood Cells',
    columns: ['wbc_smoothed', 'wbc_raw'],
    unit: 'K/uL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  rbc: {
    id: 'rbc', label: 'Red Blood Cells',
    columns: ['rbc_smoothed', 'rbc_raw'],
    unit: 'M/uL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  platelets: {
    id: 'platelets', label: 'Platelet Count',
    columns: ['platelets_smoothed', 'platelets_raw'],
    unit: 'K/uL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  mcv: {
    id: 'mcv', label: 'Mean Corpuscular Volume',
    columns: ['mcv_smoothed', 'mcv_raw'],
    unit: 'fL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  rdw: {
    id: 'rdw', label: 'Red Cell Distribution Width',
    columns: ['rdw_smoothed', 'rdw_raw'],
    unit: '%', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  nlr: {
    id: 'nlr', label: 'Neutrophil-to-Lymphocyte Ratio',
    columns: ['nlr'],
    unit: 'ratio', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  apob: {
    id: 'apob', label: 'Apolipoprotein B',
    columns: ['apob_smoothed', 'apob_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  ldl_particle_number: {
    id: 'ldl_particle_number', label: 'LDL Particle Number',
    columns: ['ldl_particle_number_smoothed', 'ldl_particle_number_raw'],
    unit: 'nmol/L', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  non_hdl_cholesterol: {
    id: 'non_hdl_cholesterol', label: 'Non-HDL Cholesterol',
    columns: ['non_hdl_cholesterol_smoothed', 'non_hdl_cholesterol_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  total_cholesterol: {
    id: 'total_cholesterol', label: 'Total Cholesterol',
    columns: ['total_cholesterol_smoothed', 'total_cholesterol_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  glucose: {
    id: 'glucose', label: 'Fasting Glucose',
    columns: ['glucose_smoothed', 'glucose_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  hba1c: {
    id: 'hba1c', label: 'HbA1c',
    columns: ['hba1c_smoothed', 'hba1c_raw'],
    unit: '%', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  insulin: {
    id: 'insulin', label: 'Insulin',
    columns: ['insulin_smoothed', 'insulin_raw'],
    unit: 'uIU/mL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  uric_acid: {
    id: 'uric_acid', label: 'Uric Acid',
    columns: ['uric_acid_smoothed', 'uric_acid_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  homocysteine: {
    id: 'homocysteine', label: 'Homocysteine',
    columns: ['homocysteine_smoothed', 'homocysteine_raw'],
    unit: 'umol/L', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  b12: {
    id: 'b12', label: 'Vitamin B12',
    columns: ['b12_smoothed', 'b12_raw'],
    unit: 'pg/mL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  folate: {
    id: 'folate', label: 'Folate',
    columns: ['folate_smoothed', 'folate_raw'],
    unit: 'ng/mL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  zinc: {
    id: 'zinc', label: 'Zinc',
    columns: ['zinc_smoothed', 'zinc_raw'],
    unit: 'mcg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  magnesium: {
    id: 'magnesium', label: 'Magnesium (RBC)',
    columns: ['magnesium_rbc_smoothed', 'magnesium_rbc_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  omega3_index: {
    id: 'omega3_index', label: 'Omega-3 Index',
    columns: ['omega3_index_derived', 'omega3_index_smoothed'],
    unit: '%', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  creatinine: {
    id: 'creatinine', label: 'Creatinine',
    columns: ['creatinine_smoothed', 'creatinine_raw'],
    unit: 'mg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  ast: {
    id: 'ast', label: 'AST',
    columns: ['ast_smoothed', 'ast_raw'],
    unit: 'U/L', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  alt: {
    id: 'alt', label: 'ALT',
    columns: ['alt_smoothed', 'alt_raw'],
    unit: 'U/L', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  albumin: {
    id: 'albumin', label: 'Albumin',
    columns: ['albumin_smoothed', 'albumin_raw'],
    unit: 'g/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  dhea_s: {
    id: 'dhea_s', label: 'DHEA-S',
    columns: ['dhea_s_smoothed', 'dhea_s_raw'],
    unit: 'mcg/dL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  shbg: {
    id: 'shbg', label: 'Sex Hormone Binding Globulin',
    columns: ['shbg_smoothed', 'shbg_raw'],
    unit: 'nmol/L', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  estradiol: {
    id: 'estradiol', label: 'Estradiol',
    columns: ['estradiol_smoothed', 'estradiol_raw'],
    unit: 'pg/mL', compleCategory: 'M', biologicalTimescale: 'slow',
  },
  free_t_ratio: {
    id: 'free_t_ratio', label: 'Free T / Total T Ratio',
    columns: ['free_t_ratio'],
    unit: 'ratio', compleCategory: 'M', biologicalTimescale: 'slow',
  },
}

// ═══════════════════════════════════════════════════════════════════
// MECHANISM CATALOG (65 entries from edge_discovery.py)
// ═══════════════════════════════════════════════════════════════════

export const MECHANISM_CATALOG: MechanismDef[] = [
  // EXERCISE VOLUME → IRON/HEMATOLOGY
  { id: 'run_vol_iron', name: 'Running Volume -> Iron', doseFamily: 'running_volume', responseFamily: 'iron_total', category: 'metabolic', mechanism: 'Foot-strike hemolysis destroys red blood cells; iron lost via hemolysis, sweat, and GI ischemia' },
  { id: 'run_vol_ferritin', name: 'Running Volume -> Ferritin', doseFamily: 'running_volume', responseFamily: 'ferritin', category: 'metabolic', mechanism: 'Chronic endurance running depletes iron stores through multiple loss pathways' },
  { id: 'run_vol_hemoglobin', name: 'Running Volume -> Hemoglobin', doseFamily: 'running_volume', responseFamily: 'hemoglobin', category: 'metabolic', mechanism: 'Iron depletion impairs hemoglobin synthesis; chronic running can cause sports anemia' },

  // TRAINING → HORMONES
  { id: 'training_hrs_testosterone', name: 'Training Hours -> Testosterone', doseFamily: 'training_duration', responseFamily: 'testosterone', category: 'metabolic', mechanism: 'Overtraining suppresses the hypothalamic-pituitary-gonadal axis' },
  { id: 'training_hrs_cortisol', name: 'Training Hours -> Cortisol', doseFamily: 'training_duration', responseFamily: 'cortisol', category: 'metabolic', mechanism: 'Chronic training stress elevates baseline cortisol via HPA axis activation' },

  // ZONE 2 → LIPIDS
  { id: 'zone2_triglycerides', name: 'Zone 2 Volume -> Triglycerides', doseFamily: 'zone2_volume', responseFamily: 'triglycerides', category: 'cardio', mechanism: 'Aerobic exercise increases lipoprotein lipase activity, clearing triglycerides' },
  { id: 'zone2_hdl', name: 'Zone 2 Volume -> HDL', doseFamily: 'zone2_volume', responseFamily: 'hdl', category: 'cardio', mechanism: 'Regular aerobic exercise upregulates HDL production and reverse cholesterol transport' },
  { id: 'zone2_ldl', name: 'Zone 2 Volume -> LDL', doseFamily: 'zone2_volume', responseFamily: 'ldl', category: 'cardio', mechanism: 'Aerobic exercise can modestly reduce LDL and shift particle size' },

  // ACWR → INFLAMMATION & RECOVERY
  { id: 'acwr_hscrp', name: 'ACWR -> Inflammation', doseFamily: 'acwr', responseFamily: 'hscrp', category: 'recovery', mechanism: 'Acute overreaching triggers systemic inflammation via muscle damage and oxidative stress' },
  { id: 'acwr_resting_hr', name: 'ACWR -> Resting HR Trend', doseFamily: 'acwr', responseFamily: 'resting_hr_trend', category: 'recovery', mechanism: 'Chronic overreaching elevates baseline sympathetic tone and resting heart rate' },

  // FITNESS ADAPTATION
  { id: 'consistency_vo2', name: 'Training Consistency -> VO2peak', doseFamily: 'training_consistency', responseFamily: 'vo2peak', category: 'cardio', mechanism: 'Consistent aerobic training drives mitochondrial biogenesis and cardiac remodeling' },
  { id: 'ferritin_vo2', name: 'Ferritin -> VO2peak', doseFamily: 'ferritin_level', responseFamily: 'vo2peak', category: 'metabolic', mechanism: 'Iron stores limit oxygen transport capacity via hemoglobin synthesis' },

  // WORKOUT TIMING → SLEEP
  { id: 'workout_time_sleep_eff', name: 'Workout Time -> Sleep Efficiency', doseFamily: 'workout_end_time', responseFamily: 'sleep_efficiency', category: 'sleep', mechanism: 'Late workouts elevate core temperature and sympathetic tone, delaying sleep onset' },
  { id: 'bedtime_sleep_quality', name: 'Bedtime -> Sleep Quality', doseFamily: 'bedtime', responseFamily: 'sleep_quality', category: 'sleep', mechanism: 'Later bedtimes misalign with circadian melatonin onset, reducing sleep architecture quality' },
  { id: 'bedtime_deep_sleep', name: 'Bedtime -> Deep Sleep', doseFamily: 'bedtime', responseFamily: 'deep_sleep', category: 'sleep', mechanism: 'Earlier bedtime captures more slow-wave sleep in the first half of the night' },

  // SLEEP → RECOVERY
  { id: 'sleep_dur_hrv', name: 'Sleep Duration -> Next-Day HRV', doseFamily: 'sleep_duration', responseFamily: 'hrv_daily', category: 'recovery', mechanism: 'Adequate sleep restores parasympathetic tone; insufficient sleep elevates sympathetic activity' },
  { id: 'sleep_debt_resting_hr', name: 'Sleep Debt -> Resting HR', doseFamily: 'sleep_debt', responseFamily: 'resting_hr', category: 'recovery', mechanism: 'Accumulated sleep deficit elevates sympathetic tone and baseline heart rate' },

  // TRAINING LOAD → RECOVERY
  { id: 'trimp_hrv', name: 'Daily Training Load -> Next-Day HRV', doseFamily: 'training_load', responseFamily: 'hrv_daily', category: 'recovery', mechanism: 'Acute training load drives autonomic nervous system fatigue measured via HRV depression' },
  { id: 'trimp_resting_hr', name: 'Daily Training Load -> Next-Day Resting HR', doseFamily: 'training_load', responseFamily: 'resting_hr', category: 'recovery', mechanism: 'Acute training elevates next-day resting HR via sympathetic activation and cardiac fatigue' },

  // ACTIVITY → SLEEP
  { id: 'steps_sleep_eff', name: 'Daily Steps -> Sleep Efficiency', doseFamily: 'daily_steps', responseFamily: 'sleep_efficiency', category: 'sleep', mechanism: 'Moderate daily activity promotes sleep; excessive activity may impair it via overarousal' },
  { id: 'energy_deep_sleep', name: 'Active Energy -> Deep Sleep', doseFamily: 'active_energy', responseFamily: 'deep_sleep', category: 'sleep', mechanism: 'Physical activity increases slow-wave sleep need via adenosine accumulation and thermoregulation' },

  // WEEKLY VOLUME → RECOVERY
  { id: 'weekly_km_hrv', name: 'Weekly Volume -> HRV Baseline', doseFamily: 'running_volume', responseFamily: 'hrv_baseline', category: 'recovery', mechanism: 'Moderate volume improves vagal tone; excessive volume suppresses it via overtraining' },

  // TRAVEL → RECOVERY
  { id: 'travel_sleep_eff', name: 'Travel Load -> Sleep Efficiency', doseFamily: 'travel_load', responseFamily: 'sleep_efficiency', category: 'sleep', mechanism: 'Jet lag disrupts circadian rhythm, delaying melatonin onset and reducing sleep efficiency' },
  { id: 'travel_hrv', name: 'Travel Load -> Daily HRV', doseFamily: 'travel_load', responseFamily: 'hrv_daily', category: 'recovery', mechanism: 'Travel stress and circadian misalignment suppress parasympathetic tone measured via HRV' },
  { id: 'travel_rhr', name: 'Travel Load -> Resting HR', doseFamily: 'travel_load', responseFamily: 'resting_hr', category: 'recovery', mechanism: 'Circadian disruption and travel fatigue elevate sympathetic tone and resting heart rate' },

  // ACTIVITY → BODY COMPOSITION
  { id: 'training_vol_body_fat', name: 'Training Volume -> Body Fat', doseFamily: 'training_duration', responseFamily: 'body_fat', category: 'metabolic', mechanism: 'Higher training volume increases energy expenditure and fat oxidation' },
  { id: 'steps_body_mass', name: 'Daily Activity -> Body Mass', doseFamily: 'daily_steps', responseFamily: 'body_mass', category: 'metabolic', mechanism: 'Higher daily activity creates energy deficit supporting weight management' },

  // EXERCISE → CBC / HEMATOLOGY
  { id: 'run_vol_rbc', name: 'Running Volume -> RBC', doseFamily: 'running_volume', responseFamily: 'rbc', category: 'metabolic', mechanism: 'Endurance running causes plasma volume expansion, diluting red cell concentration' },
  { id: 'run_vol_mcv', name: 'Running Volume -> MCV', doseFamily: 'running_volume', responseFamily: 'mcv', category: 'metabolic', mechanism: 'Iron depletion from chronic running leads to microcytic red cells (low MCV)' },
  { id: 'run_vol_rdw', name: 'Running Volume -> RDW', doseFamily: 'running_volume', responseFamily: 'rdw', category: 'metabolic', mechanism: 'Mixed cell populations from iron depletion increase red cell size variation' },

  // TRAINING → LIVER / MUSCLE ENZYMES
  { id: 'training_hrs_ast', name: 'Training Hours -> AST', doseFamily: 'training_duration', responseFamily: 'ast', category: 'metabolic', mechanism: 'Skeletal muscle damage during exercise releases AST into bloodstream' },
  { id: 'training_hrs_alt', name: 'Training Hours -> ALT', doseFamily: 'training_duration', responseFamily: 'alt', category: 'metabolic', mechanism: 'Exercise-induced hepatic stress and muscle damage elevate ALT' },

  // ZONE 2 → ADVANCED LIPIDS
  { id: 'zone2_apob', name: 'Zone 2 Volume -> ApoB', doseFamily: 'zone2_volume', responseFamily: 'apob', category: 'cardio', mechanism: 'Aerobic exercise reduces atherogenic particle count via increased LDL receptor activity' },
  { id: 'zone2_non_hdl', name: 'Zone 2 Volume -> Non-HDL Cholesterol', doseFamily: 'zone2_volume', responseFamily: 'non_hdl_cholesterol', category: 'cardio', mechanism: 'Aerobic exercise reduces atherogenic lipoproteins (LDL + VLDL + IDL)' },
  { id: 'zone2_total_chol', name: 'Zone 2 Volume -> Total Cholesterol', doseFamily: 'zone2_volume', responseFamily: 'total_cholesterol', category: 'cardio', mechanism: 'Aerobic exercise net effect on total cholesterol (HDL up, LDL down)' },

  // TRAINING → METABOLIC
  { id: 'training_hrs_glucose', name: 'Training Hours -> Glucose', doseFamily: 'training_duration', responseFamily: 'glucose', category: 'metabolic', mechanism: 'Exercise upregulates GLUT4 transporters, improving glucose disposal' },
  { id: 'training_hrs_hba1c', name: 'Training Hours -> HbA1c', doseFamily: 'training_duration', responseFamily: 'hba1c', category: 'metabolic', mechanism: 'Chronic exercise improves long-term glycemic control through insulin sensitization' },
  { id: 'training_hrs_insulin', name: 'Training Hours -> Insulin', doseFamily: 'training_duration', responseFamily: 'insulin', category: 'metabolic', mechanism: 'Regular exercise improves insulin sensitivity, lowering fasting insulin levels' },
  { id: 'training_hrs_uric_acid', name: 'Training Hours -> Uric Acid', doseFamily: 'training_duration', responseFamily: 'uric_acid', category: 'metabolic', mechanism: 'Exercise modulates purine metabolism; moderate exercise may lower uric acid' },

  // ACWR → IMMUNE
  { id: 'acwr_wbc', name: 'ACWR -> White Blood Cells', doseFamily: 'acwr', responseFamily: 'wbc', category: 'recovery', mechanism: 'Acute overreaching triggers open-window immunosuppression with transient leukopenia' },
  { id: 'acwr_nlr', name: 'ACWR -> Neutrophil-Lymphocyte Ratio', doseFamily: 'acwr', responseFamily: 'nlr', category: 'recovery', mechanism: 'Training stress shifts immune balance: neutrophilia + lymphopenia = elevated NLR' },

  // EXERCISE → MICRONUTRIENTS
  { id: 'run_vol_zinc', name: 'Running Volume -> Zinc', doseFamily: 'running_volume', responseFamily: 'zinc', category: 'metabolic', mechanism: 'Zinc lost through sweat during endurance exercise; heavy training depletes stores' },
  { id: 'run_vol_magnesium', name: 'Running Volume -> Magnesium', doseFamily: 'running_volume', responseFamily: 'magnesium', category: 'metabolic', mechanism: 'Magnesium lost through sweat and increased renal excretion during exercise' },

  // TRAINING → ADDITIONAL HORMONES
  { id: 'training_hrs_dhea', name: 'Training Hours -> DHEA-S', doseFamily: 'training_duration', responseFamily: 'dhea_s', category: 'metabolic', mechanism: 'Moderate exercise stimulates adrenal DHEA production; overtraining may deplete it' },
  { id: 'training_hrs_shbg', name: 'Training Hours -> SHBG', doseFamily: 'training_duration', responseFamily: 'shbg', category: 'metabolic', mechanism: 'Exercise increases SHBG production, affecting free testosterone availability' },

  // TIER B
  { id: 'training_hrs_homocysteine', name: 'Training Hours -> Homocysteine', doseFamily: 'training_duration', responseFamily: 'homocysteine', category: 'metabolic', mechanism: 'Exercise increases B6/B12/folate demand for methylation; may lower homocysteine' },
  { id: 'training_hrs_creatinine', name: 'Training Hours -> Creatinine', doseFamily: 'training_duration', responseFamily: 'creatinine', category: 'metabolic', mechanism: 'Higher muscle mass and exercise increase creatine turnover and serum creatinine' },
  { id: 'training_hrs_estradiol', name: 'Training Hours -> Estradiol', doseFamily: 'training_duration', responseFamily: 'estradiol', category: 'metabolic', mechanism: 'Exercise affects aromatase activity and adipose tissue estrogen production' },
  { id: 'training_hrs_platelets', name: 'Training Hours -> Platelet Count', doseFamily: 'training_duration', responseFamily: 'platelets', category: 'metabolic', mechanism: 'Acute exercise induces thrombocytosis; chronic training may modulate baseline count' },
  { id: 'training_hrs_albumin', name: 'Training Hours -> Albumin', doseFamily: 'training_duration', responseFamily: 'albumin', category: 'metabolic', mechanism: 'Exercise-induced plasma volume expansion can dilute serum albumin' },

  // SLEEP → MARKERS
  { id: 'sleep_dur_cortisol', name: 'Sleep Duration -> Cortisol', doseFamily: 'sleep_duration', responseFamily: 'cortisol', category: 'recovery', mechanism: 'Sleep restriction elevates next-morning cortisol via HPA axis dysregulation' },
  { id: 'sleep_dur_testosterone', name: 'Sleep Duration -> Testosterone', doseFamily: 'sleep_duration', responseFamily: 'testosterone', category: 'recovery', mechanism: 'Testosterone is primarily produced during sleep; restriction suppresses production' },
  { id: 'sleep_dur_glucose', name: 'Sleep Duration -> Glucose', doseFamily: 'sleep_duration', responseFamily: 'glucose', category: 'recovery', mechanism: 'Chronic sleep restriction impairs insulin sensitivity and glucose tolerance' },
  { id: 'sleep_dur_wbc', name: 'Sleep Duration -> WBC', doseFamily: 'sleep_duration', responseFamily: 'wbc', category: 'recovery', mechanism: 'Adequate sleep supports immune cell production and healthy WBC counts' },

  // CROSS-LINKS (M → M)
  { id: 'iron_sat_hemoglobin', name: 'Iron Saturation -> Hemoglobin', doseFamily: 'iron_sat_level', responseFamily: 'hemoglobin', category: 'metabolic', mechanism: 'Iron saturation determines iron availability for hemoglobin synthesis' },
  { id: 'vitamin_d_testosterone', name: 'Vitamin D -> Testosterone', doseFamily: 'vitamin_d_level', responseFamily: 'testosterone', category: 'metabolic', mechanism: 'Vitamin D receptors in Leydig cells; deficiency is associated with lower testosterone' },
  { id: 'omega3_hscrp', name: 'Omega-3 Index -> hsCRP', doseFamily: 'omega3_level', responseFamily: 'hscrp', category: 'metabolic', mechanism: 'EPA/DHA compete with arachidonic acid, reducing pro-inflammatory eicosanoid production' },
  { id: 'ferritin_rbc', name: 'Ferritin -> RBC', doseFamily: 'ferritin_level', responseFamily: 'rbc', category: 'metabolic', mechanism: 'Iron stores support erythropoiesis; depletion impairs red blood cell production' },
  { id: 'ferritin_hemoglobin', name: 'Ferritin -> Hemoglobin', doseFamily: 'ferritin_level', responseFamily: 'hemoglobin', category: 'metabolic', mechanism: 'Low ferritin limits iron availability for hemoglobin synthesis' },
  { id: 'b12_homocysteine', name: 'B12 -> Homocysteine', doseFamily: 'b12_level', responseFamily: 'homocysteine', category: 'metabolic', mechanism: 'B12 is a cofactor for methionine synthase which clears homocysteine' },
  { id: 'homocysteine_hscrp', name: 'Homocysteine -> hsCRP', doseFamily: 'homocysteine_level', responseFamily: 'hscrp', category: 'metabolic', mechanism: 'Elevated homocysteine promotes endothelial dysfunction and vascular inflammation' },

  // DIETARY → BODY COMPOSITION
  { id: 'protein_body_fat', name: 'Dietary Protein -> Body Fat', doseFamily: 'dietary_protein', responseFamily: 'body_fat', category: 'metabolic', mechanism: 'Higher protein intake increases thermic effect and satiety, supporting fat loss' },
  { id: 'energy_body_mass', name: 'Dietary Energy -> Body Mass', doseFamily: 'dietary_energy', responseFamily: 'body_mass', category: 'metabolic', mechanism: 'Chronic energy surplus/deficit drives body mass changes via energy balance' },

  // TRAVEL → ADDITIONAL
  { id: 'travel_nlr', name: 'Travel Load -> NLR', doseFamily: 'travel_load', responseFamily: 'nlr', category: 'recovery', mechanism: 'Travel stress and circadian disruption shift immune balance toward neutrophilia' },
  { id: 'travel_deep_sleep', name: 'Travel Load -> Deep Sleep', doseFamily: 'travel_load', responseFamily: 'deep_sleep', category: 'sleep', mechanism: 'Jet lag disrupts slow-wave sleep architecture via circadian misalignment' },
]

// ═══════════════════════════════════════════════════════════════════
// STRUCTURAL EDGES (54 entries from backdoor.py)
// ═══════════════════════════════════════════════════════════════════

export const STRUCTURAL_EDGES: StructuralEdge[] = [
  // Environment confounds
  { source: 'season', target: 'training_volume', edgeType: 'confounds' },
  { source: 'season', target: 'vitamin_d', edgeType: 'confounds' },
  { source: 'season', target: 'testosterone', edgeType: 'confounds' },
  { source: 'season', target: 'sleep_duration', edgeType: 'confounds' },
  { source: 'location', target: 'training_volume', edgeType: 'confounds' },
  { source: 'location', target: 'sleep_quality', edgeType: 'confounds' },
  { source: 'travel_load', target: 'sleep_quality', edgeType: 'confounds' },
  { source: 'travel_load', target: 'hrv_daily', edgeType: 'confounds' },
  { source: 'travel_load', target: 'resting_hr', edgeType: 'confounds' },
  { source: 'is_weekend', target: 'training_volume', edgeType: 'confounds' },
  { source: 'is_weekend', target: 'sleep_duration', edgeType: 'confounds' },
  { source: 'is_weekend', target: 'bedtime', edgeType: 'confounds' },

  // Training structure confounders
  { source: 'acwr', target: 'hscrp', edgeType: 'causal' },
  { source: 'acwr', target: 'resting_hr', edgeType: 'causal' },
  { source: 'acwr', target: 'testosterone', edgeType: 'causal' },
  { source: 'training_consistency', target: 'vo2_peak', edgeType: 'causal' },
  { source: 'monotony', target: 'hscrp', edgeType: 'causal' },

  // Iron pathway
  { source: 'running_volume', target: 'ground_contacts', edgeType: 'causal' },
  { source: 'ground_contacts', target: 'iron_total', edgeType: 'causal' },
  { source: 'iron_total', target: 'ferritin', edgeType: 'causal' },
  { source: 'ferritin', target: 'hemoglobin', edgeType: 'causal' },
  { source: 'hemoglobin', target: 'vo2_peak', edgeType: 'causal' },
  { source: 'ferritin', target: 'vo2_peak', edgeType: 'causal' },
  { source: 'running_volume', target: 'sweat_iron_loss', edgeType: 'causal' },
  { source: 'high_intensity', target: 'gi_iron_loss', edgeType: 'causal' },

  // Hormone pathway
  { source: 'training_volume', target: 'cortisol', edgeType: 'causal' },
  { source: 'cortisol', target: 'testosterone', edgeType: 'causal' },
  { source: 'sleep_duration', target: 'testosterone', edgeType: 'causal' },

  // Lipid pathway
  { source: 'zone2_volume', target: 'lipoprotein_lipase', edgeType: 'causal' },
  { source: 'lipoprotein_lipase', target: 'triglycerides', edgeType: 'causal' },
  { source: 'zone2_volume', target: 'reverse_cholesterol_transport', edgeType: 'causal' },
  { source: 'reverse_cholesterol_transport', target: 'hdl', edgeType: 'causal' },

  // Sleep-recovery chain
  { source: 'training_load', target: 'core_temperature', edgeType: 'causal' },
  { source: 'core_temperature', target: 'sleep_quality', edgeType: 'causal' },
  { source: 'sleep_duration', target: 'hrv_daily', edgeType: 'causal' },
  { source: 'sleep_quality', target: 'hrv_daily', edgeType: 'causal' },
  { source: 'hrv_daily', target: 'resting_hr', edgeType: 'causal' },

  // Body composition pathway
  { source: 'training_volume', target: 'energy_expenditure', edgeType: 'causal' },
  { source: 'energy_expenditure', target: 'body_fat_pct', edgeType: 'causal' },
  { source: 'body_fat_pct', target: 'leptin', edgeType: 'causal' },

  // Immune pathway
  { source: 'training_volume', target: 'wbc', edgeType: 'causal' },
  { source: 'sleep_duration', target: 'wbc', edgeType: 'causal' },
  { source: 'cortisol', target: 'wbc', edgeType: 'causal' },

  // Metabolic pathway
  { source: 'training_volume', target: 'insulin_sensitivity', edgeType: 'causal' },
  { source: 'insulin_sensitivity', target: 'glucose', edgeType: 'causal' },
  { source: 'insulin_sensitivity', target: 'insulin', edgeType: 'causal' },

  // Liver / kidney
  { source: 'training_volume', target: 'ast', edgeType: 'causal' },
  { source: 'training_volume', target: 'creatinine', edgeType: 'causal' },

  // Micronutrient depletion
  { source: 'running_volume', target: 'zinc', edgeType: 'causal' },
  { source: 'running_volume', target: 'magnesium_rbc', edgeType: 'causal' },

  // Omega-3 / inflammation
  { source: 'omega3_index', target: 'hscrp', edgeType: 'causal' },

  // Vitamin D → hormones
  { source: 'vitamin_d', target: 'testosterone', edgeType: 'confounds' },
  { source: 'season', target: 'omega3_index', edgeType: 'confounds' },

  // B12 / methylation
  { source: 'b12', target: 'homocysteine', edgeType: 'causal' },
  { source: 'homocysteine', target: 'hscrp', edgeType: 'causal' },

  // ── Regime activation edges (sigmoid curve type) ──────────────
  { source: 'acwr', target: 'overreaching_state', edgeType: 'causal' },
  { source: 'ferritin', target: 'iron_deficiency_state', edgeType: 'causal' },
  { source: 'sleep_debt', target: 'sleep_deprivation_state', edgeType: 'causal' },
  { source: 'hscrp', target: 'inflammation_state', edgeType: 'causal' },

  // ── Overreaching regime → downstream effects ──────────────────
  { source: 'overreaching_state', target: 'hscrp', edgeType: 'causal' },
  { source: 'overreaching_state', target: 'cortisol', edgeType: 'causal' },
  { source: 'overreaching_state', target: 'testosterone', edgeType: 'causal' },
  { source: 'overreaching_state', target: 'hrv_daily', edgeType: 'causal' },

  // ── Iron deficiency regime → downstream effects ───────────────
  { source: 'iron_deficiency_state', target: 'hemoglobin', edgeType: 'causal' },
  { source: 'iron_deficiency_state', target: 'vo2_peak', edgeType: 'causal' },
  { source: 'iron_deficiency_state', target: 'rbc', edgeType: 'causal' },

  // ── Sleep deprivation regime → downstream effects ─────────────
  { source: 'sleep_deprivation_state', target: 'cortisol', edgeType: 'causal' },
  { source: 'sleep_deprivation_state', target: 'testosterone', edgeType: 'causal' },
  { source: 'sleep_deprivation_state', target: 'glucose', edgeType: 'causal' },

  // ── Inflammation regime → downstream effects ──────────────────
  { source: 'inflammation_state', target: 'hdl', edgeType: 'causal' },
  { source: 'inflammation_state', target: 'insulin_sensitivity', edgeType: 'causal' },
]

// ═══════════════════════════════════════════════════════════════════
// LATENT NODES (8 entries — nodes with empty columns in backdoor.py)
// ═══════════════════════════════════════════════════════════════════

export const LATENT_NODES: string[] = [
  'sweat_iron_loss',
  'gi_iron_loss',
  'lipoprotein_lipase',
  'reverse_cholesterol_transport',
  'core_temperature',
  'energy_expenditure',
  'leptin',
  'insulin_sensitivity',
  // Regime activation states (sigmoid-gated, 0-1 range)
  'overreaching_state',
  'iron_deficiency_state',
  'sleep_deprivation_state',
  'inflammation_state',
]

// ═══════════════════════════════════════════════════════════════════
// NODE_TO_COLUMNS (from backdoor.py)
// ═══════════════════════════════════════════════════════════════════

export const NODE_TO_COLUMNS: Record<string, string[]> = {
  running_volume: ['daily_run_km', 'run_distance_km', 'weekly_run_km', 'monthly_run_km'],
  training_volume: ['daily_distance_km', 'daily_duration_min', 'weekly_volume_km'],
  zone2_volume: ['daily_zone2_min', 'zone2_minutes', 'weekly_zone2_min'],
  training_load: ['daily_trimp', 'atl'],
  high_intensity: ['daily_high_intensity_min', 'weekly_high_intensity_min'],
  ground_contacts: ['daily_ground_contacts', 'weekly_ground_contacts', 'monthly_ground_contacts'],
  iron_total: ['iron_total_smoothed', 'iron_total_raw'],
  ferritin: ['ferritin_smoothed', 'ferritin_raw'],
  hemoglobin: ['hemoglobin_smoothed', 'hemoglobin_raw'],
  vo2_peak: ['vo2_peak_smoothed', 'vo2max_apple'],
  testosterone: ['testosterone_smoothed', 'testosterone_raw'],
  cortisol: ['cortisol_smoothed', 'cortisol_raw'],
  triglycerides: ['triglycerides_smoothed', 'triglycerides_raw'],
  hdl: ['hdl_smoothed', 'hdl_raw'],
  hscrp: ['hscrp_smoothed', 'hscrp_raw'],
  sleep_quality: ['sleep_quality_score'],
  sleep_duration: ['sleep_duration_hrs'],
  sleep_efficiency: ['sleep_efficiency_pct'],
  deep_sleep: ['deep_sleep_min', 'ah_deep_sleep_min'],
  hrv_daily: ['hrv_daily_mean', 'sleep_hrv_ms'],
  resting_hr: ['resting_hr', 'sleep_hr_bpm', 'resting_hr_7d_mean'],
  body_fat_pct: ['body_fat_pct'],
  body_mass: ['body_mass_kg'],
  vitamin_d: ['vitamin_d_smoothed', 'vitamin_d_raw'],
  bedtime: ['bedtime_hour'],
  workout_time: ['last_workout_end_hour', 'latest_workout_hour'],
  steps: ['steps'],
  active_energy: ['active_energy_kcal'],
  acwr: ['acwr'],
  training_consistency: ['training_consistency', 'training_consistency_90d'],
  monotony: ['monotony'],
  sleep_debt: ['sleep_debt_14d'],
  season: ['season'],
  location: ['location'],
  travel_load: ['travel_load'],
  is_weekend: ['is_weekend'],
  day_of_week: ['day_of_week'],
  year: ['year'],
  month: ['month'],
  wbc: ['wbc_smoothed', 'wbc_raw'],
  rbc: ['rbc_smoothed', 'rbc_raw'],
  platelets: ['platelets_smoothed', 'platelets_raw'],
  mcv: ['mcv_smoothed', 'mcv_raw'],
  rdw: ['rdw_smoothed', 'rdw_raw'],
  nlr: ['nlr'],
  glucose: ['glucose_smoothed', 'glucose_raw'],
  insulin: ['insulin_smoothed', 'insulin_raw'],
  hba1c: ['hba1c_smoothed', 'hba1c_raw'],
  ast: ['ast_smoothed', 'ast_raw'],
  alt: ['alt_smoothed', 'alt_raw'],
  creatinine: ['creatinine_smoothed', 'creatinine_raw'],
  albumin: ['albumin_smoothed', 'albumin_raw'],
  zinc: ['zinc_smoothed', 'zinc_raw'],
  magnesium_rbc: ['magnesium_rbc_smoothed', 'magnesium_rbc_raw'],
  apob: ['apob_smoothed', 'apob_raw'],
  ldl_particle_number: ['ldl_particle_number_smoothed', 'ldl_particle_number_raw'],
  non_hdl_cholesterol: ['non_hdl_cholesterol_smoothed', 'non_hdl_cholesterol_raw'],
  total_cholesterol: ['total_cholesterol_smoothed', 'total_cholesterol_raw'],
  homocysteine: ['homocysteine_smoothed', 'homocysteine_raw'],
  omega3_index: ['omega3_index_derived', 'omega3_index_smoothed'],
  uric_acid: ['uric_acid_smoothed', 'uric_acid_raw'],
  b12: ['b12_smoothed', 'b12_raw'],
  folate: ['folate_smoothed', 'folate_raw'],
  estradiol: ['estradiol_smoothed', 'estradiol_raw'],
  dhea_s: ['dhea_s_smoothed', 'dhea_s_raw'],
  shbg: ['shbg_smoothed', 'shbg_raw'],
  free_testosterone: ['free_testosterone_smoothed', 'free_testosterone_raw'],
  ldl: ['ldl_smoothed', 'ldl_raw'],
  // Latent nodes (empty columns)
  sweat_iron_loss: [],
  gi_iron_loss: [],
  lipoprotein_lipase: [],
  reverse_cholesterol_transport: [],
  core_temperature: [],
  energy_expenditure: [],
  leptin: [],
  insulin_sensitivity: [],
  // Regime activation states (no direct observations)
  overreaching_state: [],
  iron_deficiency_state: [],
  sleep_deprivation_state: [],
  inflammation_state: [],
}

// ═══════════════════════════════════════════════════════════════════
// DEVICE_TO_COLUMNS — which timeline columns come from each device
// ═══════════════════════════════════════════════════════════════════

export const DEVICE_TO_COLUMNS: Record<string, string[]> = {
  'apple-watch': [
    'steps', 'active_energy_kcal', 'resting_hr', 'resting_hr_7d_mean',
    'hrv_daily_mean', 'hrv_7d_mean',
    'vo2max_apple', 'body_mass_kg', 'body_fat_pct', 'distance_walking_running_km',
    'ah_workout_duration_min', 'ah_workout_energy_kcal',
    'dietary_protein_g', 'dietary_energy_kcal',
  ],
  'autosleep': [
    'sleep_duration_hrs', 'sleep_efficiency_pct', 'sleep_quality_score',
    'deep_sleep_min', 'ah_deep_sleep_min', 'bedtime_hour',
    'sleep_hr_bpm', 'sleep_hrv_ms', 'sleep_hrv_7d', 'sleep_hr_7d',
    'sleep_debt_14d',
  ],
  'gpx': [
    'daily_run_km', 'run_distance_km', 'daily_distance_km',
    'daily_duration_min', 'daily_zone2_min', 'zone2_minutes',
    'daily_trimp', 'acwr', 'training_consistency', 'training_consistency_90d',
    'monotony', 'last_workout_end_hour', 'latest_workout_hour',
    'daily_high_intensity_min',
  ],
  'bloodwork': [
    'iron_total_smoothed', 'iron_total_raw', 'ferritin_smoothed', 'ferritin_raw',
    'hemoglobin_smoothed', 'hemoglobin_raw', 'testosterone_smoothed', 'testosterone_raw',
    'cortisol_smoothed', 'cortisol_raw', 'triglycerides_smoothed', 'triglycerides_raw',
    'hdl_smoothed', 'hdl_raw', 'ldl_smoothed', 'ldl_raw',
    'hscrp_smoothed', 'hscrp_raw', 'vitamin_d_smoothed', 'vitamin_d_raw',
    'wbc_smoothed', 'wbc_raw', 'rbc_smoothed', 'rbc_raw',
    'platelets_smoothed', 'platelets_raw', 'mcv_smoothed', 'mcv_raw',
    'rdw_smoothed', 'rdw_raw', 'nlr',
    'apob_smoothed', 'apob_raw', 'ldl_particle_number_smoothed', 'ldl_particle_number_raw',
    'non_hdl_cholesterol_smoothed', 'non_hdl_cholesterol_raw',
    'total_cholesterol_smoothed', 'total_cholesterol_raw',
    'glucose_smoothed', 'glucose_raw', 'hba1c_smoothed', 'hba1c_raw',
    'insulin_smoothed', 'insulin_raw', 'uric_acid_smoothed', 'uric_acid_raw',
    'homocysteine_smoothed', 'homocysteine_raw',
    'b12_smoothed', 'b12_raw', 'folate_smoothed', 'folate_raw',
    'zinc_smoothed', 'zinc_raw', 'magnesium_rbc_smoothed', 'magnesium_rbc_raw',
    'omega3_index_derived', 'omega3_index_smoothed',
    'creatinine_smoothed', 'creatinine_raw', 'ast_smoothed', 'ast_raw',
    'alt_smoothed', 'alt_raw', 'albumin_smoothed', 'albumin_raw',
    'dhea_s_smoothed', 'dhea_s_raw', 'shbg_smoothed', 'shbg_raw',
    'estradiol_smoothed', 'estradiol_raw', 'free_t_ratio',
    'iron_saturation_pct_smoothed', 'iron_saturation_pct_computed_smoothed',
  ],
  'medix-cpet': [
    'vo2_peak_smoothed',
  ],
  'derived': [
    'travel_load', 'season', 'location', 'is_weekend', 'day_of_week', 'year', 'month',
  ],
}

// ═══════════════════════════════════════════════════════════════════
// FULL CATALOG DATA (convenience aggregate)
// ═══════════════════════════════════════════════════════════════════

export const MECHANISM_CATALOG_DATA: MechanismCatalogData = {
  doseFamilies: DOSE_FAMILIES,
  responseFamilies: RESPONSE_FAMILIES,
  mechanisms: MECHANISM_CATALOG,
  structuralEdges: STRUCTURAL_EDGES,
  latentNodes: LATENT_NODES,
  nodeToColumns: NODE_TO_COLUMNS,
  deviceToColumns: DEVICE_TO_COLUMNS,
}
