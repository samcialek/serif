// ============================================================================
// Sample Payloads for Data Inspector
// Demonstrates inbound device data → outbound insights/protocols transformation
// ============================================================================

import type {
  TerraWebhookPayload,
  CGMReadingPayload,
  LabResultPayload,
  InsightAPIResponse,
  ProtocolAPIResponse,
  InspectorData,
} from '@/types/apiContracts';

// ============================================================================
// HUMAN EDGE: ARJUN K. - POST-DINNER WALK INSIGHT
// ============================================================================

export const arjunTerraWebhook: TerraWebhookPayload = {
  user: {
    user_id: 'terra_u_8a7f9b2c',
    provider: 'APPLE',
    last_webhook_update: '2025-01-19T22:15:00Z',
    reference_id: 'he-user-001',
  },
  type: 'activity',
  data: [
    {
      metadata: {
        start_time: '2025-01-19T19:30:00Z',
        end_time: '2025-01-19T19:48:00Z',
        upload_type: 'automatic',
      },
      activity_data: {
        steps: 1847,
        active_duration_seconds: 1080,
        moderate_intensity_seconds: 720,
        low_intensity_seconds: 360,
        calories_data: {
          total_burned_calories: 98,
          active_calories: 72,
          bmr_calories: 26,
        },
        distance_data: {
          distance_meters: 1420,
        },
      },
      heart_data: {
        resting_hr_bpm: 58,
        avg_hr_bpm: 98,
        max_hr_bpm: 112,
        min_hr_bpm: 62,
      },
    },
  ],
};

export const arjunCGMReading: CGMReadingPayload = {
  device_id: 'libre_3_f8a2b9c4',
  user_id: 'he-user-001',
  sensor_serial: 'MH00L1234X7',
  readings: [
    { timestamp: '2025-01-19T19:00:00Z', glucose_mg_dl: 142, trend_arrow: 'rising', quality_flag: 'good' },
    { timestamp: '2025-01-19T19:15:00Z', glucose_mg_dl: 158, trend_arrow: 'rising', quality_flag: 'good' },
    { timestamp: '2025-01-19T19:30:00Z', glucose_mg_dl: 165, trend_arrow: 'rising', quality_flag: 'good' },
    { timestamp: '2025-01-19T19:45:00Z', glucose_mg_dl: 152, trend_arrow: 'falling', quality_flag: 'good' },
    { timestamp: '2025-01-19T20:00:00Z', glucose_mg_dl: 138, trend_arrow: 'falling', quality_flag: 'good' },
    { timestamp: '2025-01-19T20:15:00Z', glucose_mg_dl: 124, trend_arrow: 'falling', quality_flag: 'good' },
    { timestamp: '2025-01-19T20:30:00Z', glucose_mg_dl: 118, trend_arrow: 'stable', quality_flag: 'good' },
    { timestamp: '2025-01-19T20:45:00Z', glucose_mg_dl: 112, trend_arrow: 'stable', quality_flag: 'good' },
  ],
  daily_summary: {
    date: '2025-01-19',
    time_in_range_pct: 85,
    time_above_range_pct: 12,
    time_below_range_pct: 3,
    time_very_high_pct: 2,
    time_very_low_pct: 0,
    average_glucose: 108,
    glucose_management_indicator: 5.6,
    coefficient_of_variation: 18.2,
    standard_deviation: 19.7,
    readings_count: 96,
  },
  meta: {
    sensor_start_time: '2025-01-05T08:00:00Z',
    sensor_end_time: '2025-01-19T08:00:00Z',
    days_remaining: 0,
    firmware_version: '3.2.1',
  },
};

export const arjunPostDinnerWalkInsight: InsightAPIResponse = {
  insight_id: 'ins_he001_postdinner_walk',
  user_id: 'he-user-001',
  client_id: 'human-edge',
  created_at: '2025-01-12T00:00:00Z',
  updated_at: '2025-01-19T23:00:00Z',

  model: {
    name: 'PersonalDoseResponse',
    version: '2.4.1',
    type: 'causal',
    last_trained: '2025-01-19T06:00:00Z',
  },

  content: {
    title: 'Post-Dinner Walk → Glucose Control',
    headline: 'Your 15-minute walks reduce post-meal glucose spikes by 22%',
    summary:
      'Analysis of 142 post-dinner observations shows that walking at least 1,200 steps within 30 minutes of dinner significantly reduces your glucose excursion. The effect plateaus beyond this threshold.',
    category: 'metabolic',
  },

  causal_parameters: {
    x_variable: {
      id: 'post_dinner_steps',
      name: 'Post-Dinner Steps',
      description: 'Steps taken within 30 minutes after evening meal',
      current_value: 1847,
      unit: 'steps',
      data_source: 'Terra/Apple Watch',
      sample_rate: 'per meal event',
    },
    y_variable: {
      id: 'glucose_delta_auc',
      name: 'Glucose Spike (AUC)',
      description: 'Area under the curve above baseline for 2 hours post-meal',
      unit: 'mg·min/dL',
      target_direction: 'decrease',
    },
    theta: {
      value: 1200,
      unit: 'steps',
      display_value: '1,200 steps',
      confidence_interval_95: [980, 1420],
      standard_error: 112,
      p_value: 0.001,
      interpretation: 'The minimum effective dose for glucose spike reduction',
    },
    beta: {
      below_threshold: {
        coefficient: -0.018,
        std_error: 0.004,
        t_statistic: -4.5,
        p_value: 0.0001,
        description: 'Each additional 100 steps reduces spike by 1.8%',
      },
      above_threshold: {
        coefficient: 0.002,
        std_error: 0.003,
        t_statistic: 0.67,
        p_value: 0.52,
        description: 'Minimal additional benefit beyond threshold',
      },
    },
    curve_type: 'plateau_down',
    model_fit: {
      r_squared: 0.68,
      adjusted_r_squared: 0.66,
      rmse: 142,
      aic: 1823,
      bic: 1847,
    },
  },

  evidence: {
    personal: {
      observations: 142,
      days_of_data: 180,
      weight: 0.89,
      date_range: {
        start: '2024-07-22',
        end: '2025-01-19',
      },
      data_quality_score: 0.94,
    },
    population: {
      sample_size: 12847,
      studies_referenced: 3,
      weight: 0.11,
      source_description: 'Human Edge metabolic cohort + published literature',
    },
    combined_confidence: 0.91,
    confidence_category: 'very_high',
    calibration_status: 'high_confidence',
    min_days_for_stable: 30,
  },

  status: {
    current_position: 'at_optimal',
    distance_from_threshold: 647,
    distance_unit: 'steps above',
    trend: 'stable',
    trend_days: 14,
    priority_score: 72,
  },

  linked_data: {
    data_sources: ['Terra/Apple Watch', 'Libre CGM'],
    observation_ids: ['obs_142', 'obs_141', 'obs_140'],
    time_range: {
      start: '2024-07-22',
      end: '2025-01-19',
    },
    contributing_records: 284,
  },

  recommendation: {
    action: 'Continue your post-dinner walks',
    detailed_guidance: 'Your current 1,847 steps post-dinner is above your optimal threshold of 1,200. Keep up this habit for sustained glucose control.',
    protocol_code: 'PROTO_POSTMEAL_WALK',
    urgency: 'routine',
    expected_impact: 'Maintain 22% reduction in post-meal glucose spikes',
  },

  _meta: {
    request_id: 'req_8f7a6b5c4d3e2f1a',
    processing_time_ms: 127,
    cache_hit: false,
    api_version: 'v1.2.0',
  },
};

// ============================================================================
// HUMAN EDGE: ARJUN K. - BEDTIME INSIGHT
// ============================================================================

export const arjunSleepWebhook: TerraWebhookPayload = {
  user: {
    user_id: 'terra_u_8a7f9b2c',
    provider: 'APPLE',
    last_webhook_update: '2025-01-20T07:30:00Z',
    reference_id: 'he-user-001',
  },
  type: 'sleep',
  data: [
    {
      metadata: {
        start_time: '2025-01-19T22:45:00Z',
        end_time: '2025-01-20T06:15:00Z',
        upload_type: 'automatic',
      },
      sleep_data: {
        sleep_durations_data: {
          asleep_seconds: 25200,
          awake_seconds: 1800,
          deep_seconds: 5400,
          rem_seconds: 6300,
          light_seconds: 13500,
          in_bed_seconds: 27000,
        },
        sleep_efficiency: 93.3,
        latency_seconds: 540,
        awakenings_count: 2,
      },
      heart_data: {
        resting_hr_bpm: 52,
        avg_hr_bpm: 54,
        min_hr_bpm: 48,
        hrv_data: {
          avg_sdnn: 48,
          avg_rmssd: 45,
        },
      },
    },
  ],
};

export const arjunBedtimeInsight: InsightAPIResponse = {
  insight_id: 'ins_he001_bedtime_sleep',
  user_id: 'he-user-001',
  client_id: 'human-edge',
  created_at: '2025-01-05T00:00:00Z',
  updated_at: '2025-01-19T23:00:00Z',

  model: {
    name: 'PersonalDoseResponse',
    version: '2.4.1',
    type: 'causal',
    last_trained: '2025-01-19T06:00:00Z',
  },

  content: {
    title: 'Bedtime → Sleep Efficiency',
    headline: 'Every hour after 10:15 PM costs you 2.3% sleep efficiency',
    summary:
      'Your sleep efficiency drops significantly when you go to bed after 10:15 PM. This threshold is personalized to your chronotype and lifestyle.',
    category: 'sleep',
  },

  causal_parameters: {
    x_variable: {
      id: 'bedtime_hour',
      name: 'Bedtime',
      description: 'Time you get into bed',
      current_value: 22.75,
      unit: 'hour (24h)',
      data_source: 'Terra/Apple Watch',
      sample_rate: 'daily',
    },
    y_variable: {
      id: 'sleep_efficiency',
      name: 'Sleep Efficiency',
      description: 'Percentage of time in bed spent asleep',
      unit: '%',
      target_direction: 'increase',
    },
    theta: {
      value: 22.25,
      unit: 'hour',
      display_value: '10:15 PM',
      confidence_interval_95: [21.75, 22.75],
      standard_error: 0.25,
      p_value: 0.002,
      interpretation: 'Your optimal bedtime threshold',
    },
    beta: {
      below_threshold: {
        coefficient: 0.3,
        std_error: 0.15,
        t_statistic: 2.0,
        p_value: 0.06,
        description: 'Minimal improvement from earlier bedtimes',
      },
      above_threshold: {
        coefficient: -2.3,
        std_error: 0.4,
        t_statistic: -5.75,
        p_value: 0.0001,
        description: 'Each hour later decreases efficiency by 2.3%',
      },
    },
    curve_type: 'plateau_down',
    model_fit: {
      r_squared: 0.52,
      adjusted_r_squared: 0.49,
      rmse: 4.2,
      aic: 892,
      bic: 912,
    },
  },

  evidence: {
    personal: {
      observations: 156,
      days_of_data: 180,
      weight: 0.82,
      date_range: {
        start: '2024-07-22',
        end: '2025-01-19',
      },
      data_quality_score: 0.91,
    },
    population: {
      sample_size: 8923,
      studies_referenced: 2,
      weight: 0.18,
      source_description: 'Human Edge sleep cohort',
    },
    combined_confidence: 0.85,
    confidence_category: 'high',
    calibration_status: 'stable',
    min_days_for_stable: 30,
  },

  status: {
    current_position: 'below_optimal',
    distance_from_threshold: 30,
    distance_unit: 'minutes late',
    trend: 'stable',
    trend_days: 7,
    priority_score: 68,
  },

  linked_data: {
    data_sources: ['Terra/Apple Watch'],
    observation_ids: ['obs_156', 'obs_155', 'obs_154'],
    time_range: {
      start: '2024-07-22',
      end: '2025-01-19',
    },
    contributing_records: 156,
  },

  recommendation: {
    action: 'Start winding down by 10:00 PM',
    detailed_guidance: 'Last night you went to bed at 10:45 PM, 30 minutes after your optimal threshold. Building a wind-down routine can help you get to bed earlier.',
    protocol_code: 'PROTO_BEDTIME_ROUTINE',
    urgency: 'suggested',
    expected_impact: 'Could improve sleep efficiency by 1.2%',
  },

  _meta: {
    request_id: 'req_2a3b4c5d6e7f8g9h',
    processing_time_ms: 98,
    cache_hit: true,
    api_version: 'v1.2.0',
  },
};

// ============================================================================
// HUMAN EDGE: ARJUN K. - LAB RESULT (VITAMIN D)
// ============================================================================

export const arjunLabResult: LabResultPayload = {
  report_id: 'lab_thyrocare_20250115',
  user_id: 'he-user-001',
  lab_name: 'Thyrocare Technologies',
  lab_location: 'Mumbai, Maharashtra',
  collection_date: '2025-01-15',
  report_date: '2025-01-16',
  received_date: '2025-01-16T14:30:00Z',
  processing: {
    method: 'ocr_vision',
    confidence: 0.97,
    processing_time_ms: 2340,
    review_status: 'auto_approved',
  },
  patient: {
    name: 'Arjun Kumar',
    age: 42,
    sex: 'M',
    reference_id: 'he-user-001',
  },
  results: [
    {
      loinc_code: '1989-3',
      name: 'Vitamin D, 25-Hydroxy',
      value: 28,
      unit: 'ng/mL',
      reference_range: {
        low: 20,
        high: 100,
        optimal_low: 40,
        optimal_high: 60,
        age_adjusted: false,
        sex_specific: false,
      },
      interpretation: 'low',
      flag: 'Below Optimal',
      method: 'Chemiluminescence Immunoassay',
    },
    {
      loinc_code: '4548-4',
      name: 'Hemoglobin A1c',
      value: 5.6,
      unit: '%',
      reference_range: {
        low: 4.0,
        high: 5.6,
        optimal_low: 4.5,
        optimal_high: 5.4,
        age_adjusted: true,
        sex_specific: false,
      },
      interpretation: 'normal',
      method: 'HPLC',
    },
    {
      loinc_code: '2093-3',
      name: 'Total Cholesterol',
      value: 185,
      unit: 'mg/dL',
      reference_range: {
        low: 0,
        high: 200,
        optimal_low: 0,
        optimal_high: 180,
        age_adjusted: false,
        sex_specific: false,
      },
      interpretation: 'optimal',
      method: 'Enzymatic',
    },
  ],
  attachments: {
    pdf_url: 'https://storage.serif.health/labs/he-user-001/2025-01-15.pdf',
    ocr_text_url: 'https://storage.serif.health/labs/he-user-001/2025-01-15_ocr.txt',
    ocr_json_url: 'https://storage.serif.health/labs/he-user-001/2025-01-15_ocr.json',
  },
};

// ============================================================================
// HUMAN EDGE: ARJUN K. - DAILY PROTOCOL RESPONSE
// ============================================================================

export const arjunDailyProtocol: ProtocolAPIResponse = {
  protocol_id: 'proto_he001_20250120',
  user_id: 'he-user-001',
  client_id: 'human-edge',
  date: '2025-01-20',
  generated_at: '2025-01-20T05:00:00Z',
  expires_at: '2025-01-21T05:00:00Z',

  model: {
    name: 'ProtocolPrioritizer',
    version: '1.8.0',
    optimization_objective: 'maximize_metabolic_health_score',
  },

  items: [
    {
      item_id: 'item_walk_postdinner',
      priority: 1,
      priority_label: 'high',
      code: 'PROTO_POSTMEAL_WALK',
      action: '15-min walk after dinner',
      action_detail: 'Take a 15-minute walk within 30 minutes of finishing dinner',
      category: 'exercise',
      rationale: {
        linked_insight_id: 'ins_he001_postdinner_walk',
        linked_insight_title: 'Post-Dinner Walk → Glucose Control',
        effect_description: 'Reduces your post-meal glucose spike by 22%',
        evidence_summary: 'Based on 142 personal observations over 180 days',
        personalization_note: 'Your threshold is 1,200 steps - you typically hit 1,800+',
      },
      timing: {
        time_of_day: 'evening',
        window_start: '19:00',
        window_end: '21:00',
        suggested_time: '19:30',
        duration_minutes: 15,
        frequency: 'daily',
      },
      tracking: {
        detection_method: 'passive_wearable',
        success_criteria: {
          type: 'threshold',
          metric: 'post_dinner_steps',
          threshold: 1200,
          unit: 'steps',
          operator: 'gte',
        },
        verification_source: 'Terra/Apple Watch',
        verification_delay_minutes: 30,
      },
      status: {
        state: 'pending',
      },
    },
    {
      item_id: 'item_vitamin_d',
      priority: 2,
      priority_label: 'high',
      code: 'SUPP_VITAMIN_D',
      action: 'Take Vitamin D with breakfast',
      action_detail: '2000 IU Vitamin D3 with a meal containing fat for absorption',
      category: 'supplement',
      rationale: {
        linked_lab_id: 'lab_thyrocare_20250115',
        linked_lab_result: 'Vitamin D: 28 ng/mL (optimal: 40-60)',
        effect_description: 'Addresses your suboptimal Vitamin D level',
        evidence_summary: 'Lab result from Jan 15, 2025 shows level below optimal range',
      },
      timing: {
        time_of_day: 'morning',
        window_start: '07:00',
        window_end: '10:00',
        suggested_time: '08:00',
        frequency: 'daily',
      },
      tracking: {
        detection_method: 'manual_confirmation',
        success_criteria: {
          type: 'boolean',
        },
      },
      status: {
        state: 'pending',
      },
    },
    {
      item_id: 'item_zone2',
      priority: 3,
      priority_label: 'medium',
      code: 'CARDIO_ZONE2',
      action: 'Zone 2 cardio: 30 min',
      action_detail: 'Easy pace where you can hold a conversation (HR 105-125 for you)',
      category: 'exercise',
      rationale: {
        effect_description: 'Improves metabolic flexibility and insulin sensitivity',
        evidence_summary: '3 sessions this week to hit your 150 min/week target',
        personalization_note: 'You have completed 60 minutes so far this week',
      },
      timing: {
        time_of_day: 'anytime',
        duration_minutes: 30,
        frequency: '3x per week',
      },
      tracking: {
        detection_method: 'passive_wearable',
        success_criteria: {
          type: 'duration',
          metric: 'zone2_minutes',
          threshold: 30,
          unit: 'minutes',
          operator: 'gte',
        },
        verification_source: 'Terra/Apple Watch',
      },
      status: {
        state: 'pending',
      },
    },
    {
      item_id: 'item_bedtime',
      priority: 4,
      priority_label: 'medium',
      code: 'PROTO_BEDTIME_ROUTINE',
      action: 'Wind down by 10:00 PM',
      action_detail: 'Start your wind-down routine to be in bed by 10:15 PM',
      category: 'sleep',
      rationale: {
        linked_insight_id: 'ins_he001_bedtime_sleep',
        linked_insight_title: 'Bedtime → Sleep Efficiency',
        effect_description: 'Your sleep efficiency drops 2.3% per hour after 10:15 PM',
        evidence_summary: 'Based on 156 nights of sleep data',
      },
      timing: {
        time_of_day: 'night',
        window_start: '21:30',
        window_end: '22:15',
        suggested_time: '22:00',
        frequency: 'daily',
      },
      tracking: {
        detection_method: 'passive_wearable',
        success_criteria: {
          type: 'threshold',
          metric: 'bedtime_hour',
          threshold: 22.25,
          unit: 'hour',
          operator: 'lte',
        },
        verification_source: 'Terra/Apple Watch',
        verification_delay_minutes: 480,
      },
      status: {
        state: 'pending',
      },
    },
  ],

  summary: {
    total_items: 4,
    by_priority: {
      high: 2,
      medium: 2,
      low: 0,
    },
    by_category: {
      exercise: 2,
      supplement: 1,
      sleep: 1,
    },
    estimated_total_time_minutes: 45,
    expected_impact: [
      {
        metric: 'Time in Range',
        expected_change: '+3-5%',
        confidence: 0.85,
      },
      {
        metric: 'Sleep Efficiency',
        expected_change: '+1-2%',
        confidence: 0.78,
      },
    ],
  },

  personalization: {
    user_preferences_applied: ['morning_exercise_preference', 'no_late_dinners'],
    schedule_constraints_applied: {
      wake_time: '06:00',
      sleep_time: '22:15',
      work_hours: '09:00-18:00',
    },
    excluded_interventions: ['SUPP_MAGNESIUM'],
    exclusion_reasons: {
      SUPP_MAGNESIUM: 'User reported GI sensitivity',
    },
  },

  completion: {
    completed_count: 0,
    skipped_count: 0,
    pending_count: 4,
    completion_rate: 0,
    streak_days: 12,
  },

  _meta: {
    request_id: 'req_proto_abc123',
    processing_time_ms: 234,
    api_version: 'v1.2.0',
  },
};

// ============================================================================
// INSPECTOR DATA GENERATORS
// Maps insights/protocols to their full inbound → outbound data flow
// ============================================================================

/**
 * Get inspector data for an insight by ID
 */
export function getInsightInspectorData(insightId: string): InspectorData | null {
  switch (insightId) {
    case 'ins-001': // Arjun's post-dinner walk
      return {
        insightId: 'ins-001',
        inbound: [
          {
            label: 'Terra Webhook (Activity)',
            description: 'Apple Watch activity data received via Terra API webhook',
            data: arjunTerraWebhook,
            schema: 'TerraWebhookPayload',
          },
          {
            label: 'CGM Readings',
            description: 'Abbott Libre glucose readings pulled from LibreView Cloud',
            data: arjunCGMReading,
            schema: 'CGMReadingPayload',
          },
        ],
        model: {
          label: 'PersonalDoseResponse v2.4.1',
          description: 'Piecewise linear regression with change-point detection',
          computation: `
// Identify threshold (θ) using change-point detection
const theta = findChangePoint(x_data, y_data);

// Fit piecewise linear model
const beta_below = linearRegression(
  x_data.filter(x => x < theta),
  y_data.filter((_, i) => x_data[i] < theta)
);

const beta_above = linearRegression(
  x_data.filter(x => x >= theta),
  y_data.filter((_, i) => x_data[i] >= theta)
);

// Combine with population prior (Bayesian update)
const posterior = bayesianUpdate({
  personal: { observations: 142, weight: 0.89 },
  population: { n: 12847, weight: 0.11 }
});
          `.trim(),
        },
        outbound: {
          label: 'Insight API Response',
          description: 'Personalized causal insight with θ/β parameters',
          data: arjunPostDinnerWalkInsight,
          schema: 'InsightAPIResponse',
        },
      };

    case 'ins-002': // Arjun's bedtime
      return {
        insightId: 'ins-002',
        inbound: [
          {
            label: 'Terra Webhook (Sleep)',
            description: 'Apple Watch sleep data received via Terra API webhook',
            data: arjunSleepWebhook,
            schema: 'TerraWebhookPayload',
          },
        ],
        model: {
          label: 'PersonalDoseResponse v2.4.1',
          description: 'Piecewise linear regression with change-point detection',
          computation: `
// Sleep efficiency vs bedtime analysis
const bedtimes = sleepData.map(s => parseTime(s.bedtime));
const efficiencies = sleepData.map(s => s.efficiency);

// Find optimal bedtime threshold
const theta = findChangePoint(bedtimes, efficiencies);

// Effect is negative after threshold (efficiency drops)
const beta_above = linearRegression(
  bedtimes.filter(t => t > theta),
  efficiencies.filter((_, i) => bedtimes[i] > theta)
); // Returns ~ -2.3%/hour
          `.trim(),
        },
        outbound: {
          label: 'Insight API Response',
          description: 'Personalized bedtime optimization insight',
          data: arjunBedtimeInsight,
          schema: 'InsightAPIResponse',
        },
      };

    default:
      return null;
  }
}

/**
 * Get inspector data for a protocol item by ID
 */
export function getProtocolInspectorData(
  protocolItemId: string,
  clientId: string
): InspectorData | null {
  if (clientId === 'human-edge') {
    const item = arjunDailyProtocol.items.find((i) => i.code === protocolItemId);
    if (!item) return null;

    const inbound: InspectorData['inbound'] = [];

    // Add relevant inbound data based on protocol type
    if (item.rationale.linked_insight_id) {
      if (item.code === 'PROTO_POSTMEAL_WALK') {
        inbound.push({
          label: 'Terra Activity Webhook',
          description: 'Recent activity data showing post-dinner walking pattern',
          data: arjunTerraWebhook,
          schema: 'TerraWebhookPayload',
        });
        inbound.push({
          label: 'CGM Readings',
          description: 'Post-meal glucose response data',
          data: arjunCGMReading,
          schema: 'CGMReadingPayload',
        });
      } else if (item.code === 'PROTO_BEDTIME_ROUTINE') {
        inbound.push({
          label: 'Terra Sleep Webhook',
          description: 'Recent sleep data with bedtime patterns',
          data: arjunSleepWebhook,
          schema: 'TerraWebhookPayload',
        });
      }
    }

    if (item.rationale.linked_lab_id) {
      inbound.push({
        label: 'Lab Result (OCR)',
        description: 'Processed lab report from Thyrocare',
        data: arjunLabResult,
        schema: 'LabResultPayload',
      });
    }

    return {
      protocolItemId,
      inbound,
      model: {
        label: 'ProtocolPrioritizer v1.8.0',
        description: 'Multi-objective optimization for daily actions',
        computation: `
// Score each potential protocol item
const scores = candidates.map(item => ({
  item,
  score: weightedSum([
    { factor: 'impact_magnitude', weight: 0.35, value: item.expectedImpact },
    { factor: 'confidence', weight: 0.25, value: item.evidenceConfidence },
    { factor: 'urgency', weight: 0.20, value: item.urgencyScore },
    { factor: 'user_preference', weight: 0.10, value: item.preferenceMatch },
    { factor: 'feasibility', weight: 0.10, value: item.feasibilityScore },
  ])
}));

// Apply constraints and rank
const protocol = scores
  .filter(s => !userExclusions.includes(s.item.code))
  .filter(s => fitsSchedule(s.item, userSchedule))
  .sort((a, b) => b.score - a.score)
  .slice(0, MAX_DAILY_ITEMS);
        `.trim(),
      },
      outbound: {
        label: 'Protocol Item Response',
        description: 'Prioritized action with rationale and tracking spec',
        data: item,
        schema: 'ProtocolItemResponse',
      },
    };
  }

  return null;
}

// Export full protocol responses for reference
export const protocolResponses = {
  'human-edge': arjunDailyProtocol,
};
