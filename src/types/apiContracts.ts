// ============================================================================
// Serif API Contracts
// Inbound (device/lab data) and Outbound (insights/protocols) data structures
// ============================================================================

// ============================================================================
// INBOUND CONTRACTS - Data received from devices and labs
// ============================================================================

/**
 * Terra API Webhook Payload
 * Received from wearable aggregator (Apple Watch, Fitbit, Garmin, Oura, Whoop)
 * Webhook endpoint: POST /api/webhooks/terra
 */
export interface TerraWebhookPayload {
  user: {
    user_id: string;
    provider: 'APPLE' | 'FITBIT' | 'GARMIN' | 'OURA' | 'WHOOP';
    last_webhook_update: string;
    reference_id?: string; // Our internal user ID
  };
  type: 'daily' | 'activity' | 'sleep' | 'body' | 'nutrition';
  data: TerraDataPayload[];
}

export interface TerraDataPayload {
  metadata: {
    start_time: string;
    end_time: string;
    upload_type: 'automatic' | 'manual';
  };
  activity_data?: {
    steps: number;
    active_duration_seconds: number;
    low_intensity_seconds?: number;
    moderate_intensity_seconds?: number;
    vigorous_intensity_seconds?: number;
    calories_data?: {
      total_burned_calories: number;
      active_calories: number;
      bmr_calories: number;
    };
    distance_data?: {
      distance_meters: number;
    };
    floors_climbed?: number;
  };
  sleep_data?: {
    sleep_durations_data: {
      asleep_seconds: number;
      awake_seconds: number;
      deep_seconds: number;
      rem_seconds: number;
      light_seconds: number;
      in_bed_seconds: number;
    };
    sleep_efficiency?: number;
    latency_seconds?: number;
    awakenings_count?: number;
  };
  heart_data?: {
    resting_hr_bpm: number;
    avg_hr_bpm?: number;
    max_hr_bpm?: number;
    min_hr_bpm?: number;
    hrv_data?: {
      avg_sdnn: number;
      avg_rmssd: number;
    };
  };
  body_data?: {
    weight_kg?: number;
    body_fat_pct?: number;
    muscle_mass_kg?: number;
    bone_mass_kg?: number;
    water_pct?: number;
  };
  stress_data?: {
    avg_stress_level: number; // 0-100
    max_stress_level: number;
    stress_duration_seconds: number;
    rest_duration_seconds: number;
  };
}

/**
 * CGM Reading Payload
 * Received from Abbott FreeStyle Libre via LibreView Cloud
 * Pull endpoint: GET /api/integrations/libreview/readings
 */
export interface CGMReadingPayload {
  device_id: string;
  user_id: string;
  sensor_serial: string;
  readings: CGMReading[];
  daily_summary?: CGMDailySummary;
  meta: {
    sensor_start_time: string;
    sensor_end_time: string;
    days_remaining: number;
    firmware_version: string;
  };
}

export interface CGMReading {
  timestamp: string;
  glucose_mg_dl: number;
  trend_arrow: 'rising_fast' | 'rising' | 'stable' | 'falling' | 'falling_fast';
  quality_flag: 'good' | 'low_confidence' | 'sensor_error' | 'calibrating';
  is_scan?: boolean; // Manual scan vs automatic
}

export interface CGMDailySummary {
  date: string;
  time_in_range_pct: number; // 70-140 mg/dL
  time_above_range_pct: number; // >140 mg/dL
  time_below_range_pct: number; // <70 mg/dL
  time_very_high_pct: number; // >180 mg/dL
  time_very_low_pct: number; // <54 mg/dL
  average_glucose: number;
  glucose_management_indicator: number; // Estimated A1c
  coefficient_of_variation: number; // Glucose variability
  standard_deviation: number;
  readings_count: number;
}

/**
 * Lab Result Payload
 * Received from pathology labs (Thyrocare, Metropolis) via OCR pipeline
 * Pipeline: PDF → Google Vision OCR → Regex extraction → Validation → BigQuery
 */
export interface LabResultPayload {
  report_id: string;
  user_id: string;
  lab_name: string;
  lab_location?: string;
  collection_date: string;
  report_date: string;
  received_date: string;
  processing: {
    method: 'ocr_vision' | 'ocr_textract' | 'hl7_fhir' | 'manual_entry';
    confidence: number;
    processing_time_ms: number;
    reviewed_by?: string;
    review_status: 'auto_approved' | 'pending_review' | 'manually_verified';
  };
  patient: {
    name: string;
    age: number;
    sex: 'M' | 'F' | 'O';
    reference_id?: string;
  };
  results: LabResultItem[];
  attachments: {
    pdf_url: string;
    ocr_text_url?: string;
    ocr_json_url?: string;
  };
}

export interface LabResultItem {
  loinc_code: string;
  name: string;
  value: number;
  unit: string;
  reference_range: {
    low: number;
    high: number;
    optimal_low?: number;
    optimal_high?: number;
    age_adjusted?: boolean;
    sex_specific?: boolean;
  };
  interpretation: 'critical_low' | 'low' | 'normal' | 'optimal' | 'high' | 'critical_high';
  flag?: string;
  method?: string;
  notes?: string;
}

/**
 * Self-Report Survey Payload
 * Received from mobile app survey submissions
 * Endpoint: POST /api/surveys/submit
 */
export interface SurveySubmissionPayload {
  submission_id: string;
  user_id: string;
  survey_type: 'weekly_checkin' | 'daily_mood' | 'symptom_log' | 'food_log' | 'onboarding';
  submitted_at: string;
  responses: Record<string, string | number | boolean | string[]>;
  completion_time_seconds: number;
  device_info: {
    platform: 'ios' | 'android' | 'web';
    app_version: string;
  };
}

// ============================================================================
// OUTBOUND CONTRACTS - Data returned to clients
// ============================================================================

/**
 * Insight API Response
 * Endpoint: GET /api/v1/users/{userId}/insights
 * Returns personalized causal insights with full model parameters
 */
export interface InsightAPIResponse {
  insight_id: string;
  user_id: string;
  client_id: string;
  created_at: string;
  updated_at: string;

  // Model metadata
  model: {
    name: string;
    version: string;
    type: 'causal' | 'predictive' | 'descriptive';
    last_trained: string;
  };

  // Human-readable content
  content: {
    title: string;
    headline: string;
    summary: string;
    category: 'metabolic' | 'sleep' | 'recovery' | 'cardio' | 'behavioral' | 'nutrition';
  };

  // Causal model parameters
  causal_parameters: {
    x_variable: {
      id: string;
      name: string;
      description: string;
      current_value: number;
      unit: string;
      data_source: string;
      sample_rate: string;
    };
    y_variable: {
      id: string;
      name: string;
      description: string;
      unit: string;
      target_direction: 'increase' | 'decrease' | 'optimize' | 'maintain';
    };
    theta: {
      value: number;
      unit: string;
      display_value: string;
      confidence_interval_95: [number, number];
      standard_error: number;
      p_value: number;
      interpretation: string;
    };
    beta: {
      below_threshold: {
        coefficient: number;
        std_error: number;
        t_statistic: number;
        p_value: number;
        description: string;
      };
      above_threshold: {
        coefficient: number;
        std_error: number;
        t_statistic: number;
        p_value: number;
        description: string;
      };
    };
    curve_type: 'plateau_up' | 'plateau_down' | 'v_min' | 'v_max' | 'linear';
    model_fit: {
      r_squared: number;
      adjusted_r_squared: number;
      rmse: number;
      aic: number;
      bic: number;
    };
  };

  // Evidence breakdown
  evidence: {
    personal: {
      observations: number;
      days_of_data: number;
      weight: number;
      date_range: {
        start: string;
        end: string;
      };
      data_quality_score: number;
    };
    population: {
      sample_size: number;
      studies_referenced: number;
      weight: number;
      source_description: string;
    };
    combined_confidence: number;
    confidence_category: 'low' | 'moderate' | 'high' | 'very_high';
    calibration_status: 'initializing' | 'calibrating' | 'stable' | 'high_confidence';
    min_days_for_stable: number;
  };

  // Current status
  status: {
    current_position: 'below_optimal' | 'at_optimal' | 'above_optimal';
    distance_from_threshold: number;
    distance_unit: string;
    trend: 'improving' | 'stable' | 'declining';
    trend_days: number;
    priority_score: number; // 0-100, used for ranking
  };

  // Data provenance
  linked_data: {
    data_sources: string[];
    observation_ids: string[];
    time_range: {
      start: string;
      end: string;
    };
    contributing_records: number;
  };

  // Actionable recommendation
  recommendation: {
    action: string;
    detailed_guidance?: string;
    protocol_code?: string;
    urgency: 'routine' | 'suggested' | 'important' | 'urgent';
    expected_impact?: string;
  };

  // API metadata
  _meta: {
    request_id: string;
    processing_time_ms: number;
    cache_hit: boolean;
    api_version: string;
  };
}

/**
 * Protocol API Response
 * Endpoint: GET /api/v1/users/{userId}/protocols/daily
 * Returns prioritized daily action items with tracking specs
 */
export interface ProtocolAPIResponse {
  protocol_id: string;
  user_id: string;
  client_id: string;
  date: string;
  generated_at: string;
  expires_at: string;

  // Model metadata
  model: {
    name: string;
    version: string;
    optimization_objective: string;
  };

  // Protocol items
  items: ProtocolItemResponse[];

  // Summary statistics
  summary: {
    total_items: number;
    by_priority: {
      high: number;
      medium: number;
      low: number;
    };
    by_category: Record<string, number>;
    estimated_total_time_minutes: number;
    expected_impact: {
      metric: string;
      expected_change: string;
      confidence: number;
    }[];
  };

  // Personalization info
  personalization: {
    user_preferences_applied: string[];
    schedule_constraints_applied: {
      wake_time: string;
      sleep_time: string;
      work_hours?: string;
    };
    excluded_interventions: string[];
    exclusion_reasons: Record<string, string>;
  };

  // Completion tracking
  completion: {
    completed_count: number;
    skipped_count: number;
    pending_count: number;
    completion_rate: number;
    streak_days: number;
  };

  // API metadata
  _meta: {
    request_id: string;
    processing_time_ms: number;
    api_version: string;
  };
}

export interface ProtocolItemResponse {
  item_id: string;
  priority: number;
  priority_label: 'high' | 'medium' | 'low';
  code: string;
  action: string;
  action_detail?: string;
  category: 'nutrition' | 'exercise' | 'sleep' | 'supplement' | 'behavior' | 'monitoring' | 'medication';

  // Why this action
  rationale: {
    linked_insight_id?: string;
    linked_insight_title?: string;
    linked_lab_id?: string;
    linked_lab_result?: string;
    effect_description: string;
    evidence_summary: string;
    personalization_note?: string;
  };

  // When to do it
  timing: {
    time_of_day: 'morning' | 'afternoon' | 'evening' | 'night' | 'anytime' | 'with_meal' | 'before_bed';
    window_start?: string;
    window_end?: string;
    suggested_time?: string;
    duration_minutes?: number;
    frequency?: string;
  };

  // How to track completion
  tracking: {
    detection_method: 'passive_wearable' | 'passive_cgm' | 'passive_app' | 'manual_confirmation' | 'auto_inferred';
    success_criteria: {
      type: 'threshold' | 'boolean' | 'duration' | 'count';
      metric?: string;
      threshold?: number;
      unit?: string;
      operator?: 'gte' | 'lte' | 'eq' | 'between';
    };
    verification_source?: string;
    verification_delay_minutes?: number;
  };

  // Current status
  status: {
    state: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'missed';
    completed_at?: string;
    completion_value?: number;
    skipped_reason?: string;
    auto_detected?: boolean;
  };
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface InspectorData {
  insightId?: string;
  protocolItemId?: string;
  inbound: {
    label: string;
    description: string;
    data: TerraWebhookPayload | CGMReadingPayload | LabResultPayload | SurveySubmissionPayload;
    schema: string;
  }[];
  model?: {
    label: string;
    description: string;
    computation: string; // Pseudo-code or description
  };
  outbound: {
    label: string;
    description: string;
    data: InsightAPIResponse | ProtocolItemResponse;
    schema: string;
  };
}
