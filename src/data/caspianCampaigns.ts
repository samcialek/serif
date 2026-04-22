// ============================================================================
// LOAD LEVERS & CAMPAIGNS — Prescriptive multi-week plans for Oron's loads
// ============================================================================
//
// Architecture: Campaigns are PEER concepts alongside DerivedProtocols.
// Load levers belong to the load variable itself, referenced by both
// protocols and campaigns.
//
// PersonaLoad (extended with targetRange, levers, strategy)
//   ├── strategy: 'maintain' → existing DerivedProtocols act as guardrails
//   └── strategy: 'recover'  → Campaign with phases, checkpoints, trajectory
//                               └── each phase references LoadLevers as daily actions
// ============================================================================

import type { LoadLever, Campaign } from '@/types'

// ============================================================================
// LOAD LEVERS — What actions move each load
// ============================================================================

// ── Travel Load Levers ──
export const travelLoadLevers: LoadLever[] = [
  {
    id: 'travel-bright-light',
    loadId: 'travel-load',
    action: 'Morning bright light exposure 30 min',
    effect: { magnitude: 0.1, direction: 'decrease', unit: 'score/day' },
    timeConstant: 'days',
    category: 'recovery',
    evidenceSource: 'Eastman & Burgess 2009, circadian phase advance protocol',
    isActive: true,
  },
  {
    id: 'travel-melatonin',
    loadId: 'travel-load',
    action: 'Melatonin 0.5 mg at local bedtime minus 30 min',
    effect: { magnitude: 0.08, direction: 'decrease', unit: 'score/day' },
    timeConstant: 'days',
    category: 'sleep',
    evidenceSource: 'Herxheimer & Petrie 2002, Cochrane systematic review',
    isActive: true,
  },
  {
    id: 'travel-meal-timing',
    loadId: 'travel-load',
    action: 'Align meals to destination timezone',
    effect: { magnitude: 0.05, direction: 'decrease', unit: 'score/day' },
    timeConstant: 'days',
    category: 'nutrition',
    evidenceSource: 'Wehrens et al. 2017, peripheral clock entrainment via meal timing',
    isActive: true,
  },
  {
    id: 'travel-avoid-exercise',
    loadId: 'travel-load',
    action: 'Avoid intense exercise first 24 h after arrival',
    effect: { magnitude: 0.1, direction: 'decrease', unit: 'spike prevented' },
    timeConstant: 'immediate',
    category: 'training',
    evidenceSource: 'Reilly et al. 2007, exercise timing and jet lag recovery',
    isActive: true,
  },
]

// ── Iron Depletion Levers ──
export const ironDepletionLevers: LoadLever[] = [
  {
    id: 'iron-supplement',
    loadId: 'iron-depletion',
    action: 'Iron bisglycinate 25 mg + vitamin C daily',
    effect: { magnitude: 0.5, direction: 'increase', unit: '% TSAT/week' },
    timeConstant: 'weeks',
    category: 'nutrition',
    evidenceSource: 'Stoffel et al. 2020, alternate-day iron supplementation in athletes',
    isActive: true,
  },
  {
    id: 'iron-absorption',
    loadId: 'iron-depletion',
    action: 'Avoid calcium/coffee within 2 h of iron dose',
    effect: { magnitude: 30, direction: 'decrease', unit: '% absorption penalty removed' },
    timeConstant: 'days',
    category: 'nutrition',
    evidenceSource: 'Hallberg et al. 1991, inhibitors of non-heme iron absorption',
    isActive: true,
  },
  {
    id: 'iron-reduce-running',
    loadId: 'iron-depletion',
    action: 'Reduce running volume to <35 km/week',
    effect: { magnitude: 1, direction: 'decrease', unit: 'hemolysis loss reduced' },
    timeConstant: 'weeks',
    category: 'training',
    evidenceSource: 'Telford et al. 2003, foot-strike hemolysis in runners',
    isActive: true,
  },
  {
    id: 'iron-iv-infusion',
    loadId: 'iron-depletion',
    action: 'IV iron infusion (ferric carboxymaltose)',
    effect: { magnitude: 20, direction: 'increase', unit: '% TSAT (15-25% range)' },
    timeConstant: 'immediate',
    category: 'medical',
    evidenceSource: 'Burden et al. 2015, IV iron in iron-deficient athletes',
    prerequisites: ['medical clearance', 'hematologist referral'],
    isActive: false,
  },
]

// ── ACWR / Training Load Levers ──
export const acwrLevers: LoadLever[] = [
  {
    id: 'acwr-gradual-increase',
    loadId: 'training-load',
    action: 'Increase weekly training volume by 10%/week',
    effect: { magnitude: 0.05, direction: 'increase', unit: 'ACWR ratio/week' },
    timeConstant: 'weeks',
    category: 'training',
    evidenceSource: 'Gabbett 2016, training-injury prevention paradox',
    isActive: true,
  },
  {
    id: 'acwr-polarized',
    loadId: 'training-load',
    action: '80/20 polarized training distribution',
    effect: { magnitude: 1, direction: 'decrease', unit: 'keeps in 0.8-1.3 window' },
    timeConstant: 'weeks',
    category: 'training',
    evidenceSource: 'Stoggl & Sperlich 2015, polarized training in endurance athletes',
    isActive: true,
  },
  {
    id: 'acwr-hard-session',
    loadId: 'training-load',
    action: 'Add one higher-intensity session per week',
    effect: { magnitude: 0.1, direction: 'increase', unit: 'ATL boost' },
    timeConstant: 'days',
    category: 'training',
    evidenceSource: 'Seiler 2010, high-intensity interval training for endurance',
    isActive: true,
  },
]

// ── Omega-3 Levers ──
export const omega3Levers: LoadLever[] = [
  {
    id: 'omega3-supplement',
    loadId: 'omega3-status',
    action: 'EPA/DHA supplement 2-3 g daily',
    effect: { magnitude: 2, direction: 'decrease', unit: 'AA/EPA ratio/month' },
    timeConstant: 'months',
    category: 'nutrition',
    evidenceSource: 'Calder 2015, marine omega-3 fatty acids and inflammation',
    isActive: true,
  },
  {
    id: 'omega3-fatty-fish',
    loadId: 'omega3-status',
    action: 'Fatty fish 3x/week (salmon, mackerel, sardines)',
    effect: { magnitude: 1, direction: 'decrease', unit: 'AA/EPA ratio/month' },
    timeConstant: 'months',
    category: 'nutrition',
    evidenceSource: 'Mozaffarian & Rimm 2006, fish intake and cardiovascular risk',
    isActive: true,
  },
  {
    id: 'omega3-reduce-omega6',
    loadId: 'omega3-status',
    action: 'Reduce omega-6 seed oils (soybean, sunflower, corn)',
    effect: { magnitude: 0.5, direction: 'decrease', unit: 'AA/EPA ratio/month' },
    timeConstant: 'months',
    category: 'nutrition',
    evidenceSource: 'Simopoulos 2002, omega-6/omega-3 ratio and chronic disease',
    isActive: true,
  },
]

// All levers grouped by load
export const allLoadLevers: Record<string, LoadLever[]> = {
  'travel-load': travelLoadLevers,
  'iron-depletion': ironDepletionLevers,
  'training-load': acwrLevers,
  'omega3-status': omega3Levers,
}

// ============================================================================
// CAMPAIGNS — Multi-week recovery plans
// ============================================================================

export const oronCampaigns: Campaign[] = [
  // ── Iron Recovery Campaign ── 12 weeks, 3 phases
  {
    id: 'campaign-iron-recovery',
    personaId: 'oron',
    loadId: 'iron-depletion',
    name: 'Iron Recovery',
    status: 'active',
    currentValue: 9,
    goalValue: 22,
    currentUnit: '% TSAT',
    estimatedDurationWeeks: 12,
    startDate: '2025-12-01',
    currentWeek: 10,
    activePhaseId: 'iron-phase-3',
    phases: [
      {
        id: 'iron-phase-1',
        name: 'Foundation',
        weekRange: [1, 2],
        goal: 'Start iron supplement protocol and reduce running-induced hemolysis',
        dailyActions: [
          {
            id: 'iron-p1-supplement',
            leverId: 'iron-supplement',
            action: 'Iron bisglycinate 25 mg + vitamin C on empty stomach',
            frequency: 'daily',
            timing: '06:15 — 30 min before breakfast',
            category: 'nutrition',
            detail: 'Take on empty stomach for maximum absorption',
          },
          {
            id: 'iron-p1-absorption',
            leverId: 'iron-absorption',
            action: 'No coffee or calcium within 2 h of iron dose',
            frequency: 'daily',
            timing: 'Morning',
            category: 'nutrition',
            detail: 'Caffeine cutoff before iron is OK; coffee after 08:15',
          },
          {
            id: 'iron-p1-volume',
            leverId: 'iron-reduce-running',
            action: 'Cap running at <30 km/week',
            frequency: 'weekly',
            category: 'training',
            detail: 'Substitute bike sessions for iron-sparing aerobic work',
          },
        ],
        constraints: [
          'No runs >10 km during this phase',
          'Prefer cycling for aerobic sessions',
        ],
        expectedLoadValue: 11,
      },
      {
        id: 'iron-phase-2',
        name: 'Build',
        weekRange: [3, 8],
        goal: 'Maintain supplement and gradually raise volume to 35 km while TSAT rises',
        dailyActions: [
          {
            id: 'iron-p2-supplement',
            leverId: 'iron-supplement',
            action: 'Iron bisglycinate 25 mg + vitamin C daily',
            frequency: 'daily',
            timing: '06:15',
            category: 'nutrition',
          },
          {
            id: 'iron-p2-absorption',
            leverId: 'iron-absorption',
            action: 'Maintain absorption protocol',
            frequency: 'daily',
            category: 'nutrition',
          },
          {
            id: 'iron-p2-volume',
            leverId: 'iron-reduce-running',
            action: 'Gradually increase running to 35 km/week (10%/week)',
            frequency: 'weekly',
            category: 'training',
            detail: 'Add ~2-3 km/week as iron status improves',
          },
          {
            id: 'iron-p2-fish',
            leverId: 'omega3-fatty-fish',
            action: 'Iron-rich foods 3x/week (red meat, lentils)',
            frequency: 'weekly',
            category: 'nutrition',
            detail: 'Dietary iron in addition to supplement',
          },
        ],
        constraints: [
          'If TSAT drops below 10% at week 6 checkpoint, consult hematologist for IV iron',
        ],
        expectedLoadValue: 16,
      },
      {
        id: 'iron-phase-3',
        name: 'Verify',
        weekRange: [9, 12],
        goal: 'Confirm stability and resume normal volume if TSAT >20%',
        dailyActions: [
          {
            id: 'iron-p3-supplement',
            leverId: 'iron-supplement',
            action: 'Continue iron supplement (may reduce to alternate-day if TSAT >20%)',
            frequency: 'daily',
            timing: '06:15',
            category: 'nutrition',
          },
          {
            id: 'iron-p3-volume',
            leverId: 'iron-reduce-running',
            action: 'Resume normal running volume if TSAT >20%',
            frequency: 'weekly',
            category: 'training',
            detail: 'If TSAT still below 20%, maintain 35 km cap',
          },
        ],
        constraints: [
          'Lab retest at week 12 required before removing volume cap',
        ],
        expectedLoadValue: 22,
      },
    ],
    checkpoints: [
      {
        id: 'iron-cp-1',
        weekNumber: 2,
        type: 'lab-retest',
        description: 'Early check — confirm iron supplement is being absorbed',
        metric: 'TSAT',
        targetValue: 11,
        action: 'Draw iron panel + ferritin via Quest Labs',
      },
      {
        id: 'iron-cp-2',
        weekNumber: 6,
        type: 'lab-retest',
        description: 'Mid-campaign check — TSAT should be rising steadily',
        metric: 'TSAT',
        targetValue: 16,
        action: 'Draw iron panel + ferritin + CBC. If TSAT <12%, escalate to hematologist.',
      },
      {
        id: 'iron-cp-3',
        weekNumber: 12,
        type: 'lab-retest',
        description: 'Final verification — confirm recovery and stability',
        metric: 'TSAT',
        targetValue: 22,
        action: 'Draw full iron panel. If TSAT >20%, transition to maintenance protocol.',
      },
    ],
    trajectory: [
      { weekNumber: 0, expectedValue: 9, rangeLow: 8, rangeHigh: 10, label: 'Baseline' },
      { weekNumber: 2, expectedValue: 11, rangeLow: 9, rangeHigh: 13, label: 'Foundation' },
      { weekNumber: 4, expectedValue: 13, rangeLow: 10, rangeHigh: 16 },
      { weekNumber: 6, expectedValue: 16, rangeLow: 12, rangeHigh: 19, label: 'Mid-check' },
      { weekNumber: 8, expectedValue: 18, rangeLow: 14, rangeHigh: 22 },
      { weekNumber: 10, expectedValue: 20, rangeLow: 16, rangeHigh: 24, label: 'Current' },
      { weekNumber: 12, expectedValue: 22, rangeLow: 18, rangeHigh: 26, label: 'Goal' },
    ],
    confidence: 'high',
    reasoning:
      'Iron bisglycinate at 25 mg/day with vitamin C has shown 0.5% TSAT/week improvement in athletes (Stoffel et al. 2020). Combined with running volume reduction to limit foot-strike hemolysis, trajectory projects TSAT from 9% to 22% over 12 weeks. Confidence is high due to well-established supplementation evidence and Oron\'s rising ferritin trend (24 → 46 ng/mL over past year).',
    sourceInsightIds: ['oron_insight_1', 'oron_insight_12'],
  },

  // ── Training Ramp-Up Campaign ── 4 weeks, 2 phases
  {
    id: 'campaign-training-ramp',
    personaId: 'oron',
    loadId: 'training-load',
    name: 'Training Ramp-Up',
    status: 'active',
    currentValue: 0.69,
    goalValue: 1.0,
    currentUnit: 'ACWR ratio',
    estimatedDurationWeeks: 4,
    startDate: '2026-02-01',
    currentWeek: 1,
    activePhaseId: 'training-phase-1',
    phases: [
      {
        id: 'training-phase-1',
        name: 'Reactivation',
        weekRange: [1, 2],
        goal: '3 easy sessions/week with 10% volume increase',
        dailyActions: [
          {
            id: 'training-p1-easy',
            leverId: 'acwr-gradual-increase',
            action: '3 easy Zone 2 sessions per week',
            frequency: 'weekly',
            category: 'training',
            detail: 'Mix of run (2x) and bike (1x), 40-60 min each',
          },
          {
            id: 'training-p1-polarized',
            leverId: 'acwr-polarized',
            action: 'Keep all sessions in Zone 1-2',
            frequency: 'daily',
            category: 'training',
            detail: 'No intensity work until week 3',
          },
        ],
        constraints: [
          'No sessions above Zone 2',
          'Maximum 10% volume increase per week',
        ],
        expectedLoadValue: 0.85,
      },
      {
        id: 'training-phase-2',
        name: 'Build',
        weekRange: [3, 4],
        goal: 'Add one moderate session, approach 0.8-1.0 ACWR',
        dailyActions: [
          {
            id: 'training-p2-moderate',
            leverId: 'acwr-hard-session',
            action: 'Add 1 moderate-intensity session per week',
            frequency: 'weekly',
            category: 'training',
            detail: 'Tempo run or Zone 3 intervals, 30-40 min',
          },
          {
            id: 'training-p2-easy',
            leverId: 'acwr-gradual-increase',
            action: 'Continue 3 easy sessions + 1 moderate',
            frequency: 'weekly',
            category: 'training',
            detail: '4 sessions total, building toward habitual load',
          },
          {
            id: 'training-p2-polarized',
            leverId: 'acwr-polarized',
            action: 'Maintain 80/20 distribution (3 easy : 1 moderate)',
            frequency: 'weekly',
            category: 'training',
          },
        ],
        constraints: [
          'ACWR must not exceed 1.2',
          'Monitor NLR if available',
        ],
        expectedLoadValue: 1.0,
      },
    ],
    checkpoints: [
      {
        id: 'training-cp-1',
        weekNumber: 2,
        type: 'metric-review',
        description: 'Review ACWR trend and HRV response after 2 weeks of easy training',
        metric: 'ACWR',
        targetValue: 0.85,
        action: 'Check ACWR from Apple Watch + GPX data. If HRV drops >15%, reduce volume.',
      },
    ],
    trajectory: [
      { weekNumber: 0, expectedValue: 0.69, rangeLow: 0.65, rangeHigh: 0.73, label: 'Baseline' },
      { weekNumber: 1, expectedValue: 0.77, rangeLow: 0.72, rangeHigh: 0.82, label: 'Current' },
      { weekNumber: 2, expectedValue: 0.85, rangeLow: 0.78, rangeHigh: 0.92, label: 'Check' },
      { weekNumber: 3, expectedValue: 0.93, rangeLow: 0.85, rangeHigh: 1.0 },
      { weekNumber: 4, expectedValue: 1.0, rangeLow: 0.90, rangeHigh: 1.1, label: 'Goal' },
    ],
    confidence: 'high',
    reasoning:
      'ACWR at 0.69 indicates under-training relative to habitual load. Gradual 10%/week volume increase is the established safe ramp rate (Gabbett 2016). With current CTL at 11.2, adding 3 easy sessions/week moves ACWR toward 0.85 within 2 weeks. Adding a moderate session in week 3-4 should bring ACWR to 1.0. NLR insight caps upper bound at 1.2.',
    sourceInsightIds: ['oron_insight_10', 'oron_insight_40'],
  },

  // ── Omega-3 Rebalance Campaign ── 8 weeks, 2 phases
  {
    id: 'campaign-omega3-rebalance',
    personaId: 'oron',
    loadId: 'omega3-status',
    name: 'Omega-3 Rebalance',
    status: 'planned',
    currentValue: 30.9,
    goalValue: 10,
    currentUnit: 'AA/EPA ratio',
    estimatedDurationWeeks: 8,
    phases: [
      {
        id: 'omega3-phase-1',
        name: 'Supplement',
        weekRange: [1, 4],
        goal: 'Start EPA/DHA supplementation and increase dietary omega-3',
        dailyActions: [
          {
            id: 'omega3-p1-supplement',
            leverId: 'omega3-supplement',
            action: 'EPA/DHA 2 g daily with dinner',
            frequency: 'daily',
            timing: 'With evening meal for fat-soluble absorption',
            category: 'nutrition',
            detail: 'Look for >60% EPA formulation',
          },
          {
            id: 'omega3-p1-fish',
            leverId: 'omega3-fatty-fish',
            action: 'Fatty fish 2x/week (salmon, mackerel, sardines)',
            frequency: 'weekly',
            category: 'nutrition',
            detail: 'Replace 2 dinners per week with fatty fish',
          },
        ],
        constraints: [
          'Monitor for fish oil GI side effects',
          'Take with food to reduce reflux',
        ],
        expectedLoadValue: 22,
      },
      {
        id: 'omega3-phase-2',
        name: 'Optimize',
        weekRange: [5, 8],
        goal: 'Increase dose if tolerated and add omega-6 reduction',
        dailyActions: [
          {
            id: 'omega3-p2-supplement',
            leverId: 'omega3-supplement',
            action: 'Increase EPA/DHA to 3 g daily if tolerated',
            frequency: 'daily',
            timing: 'Split 2 g dinner + 1 g lunch',
            category: 'nutrition',
          },
          {
            id: 'omega3-p2-fish',
            leverId: 'omega3-fatty-fish',
            action: 'Fatty fish 3x/week',
            frequency: 'weekly',
            category: 'nutrition',
          },
          {
            id: 'omega3-p2-reduce-omega6',
            leverId: 'omega3-reduce-omega6',
            action: 'Replace seed oils with olive oil / avocado oil',
            frequency: 'daily',
            category: 'nutrition',
            detail: 'Audit cooking oils, salad dressings, packaged foods',
          },
        ],
        constraints: [
          'If GI issues persist at 3 g, revert to 2 g',
        ],
        expectedLoadValue: 10,
      },
    ],
    checkpoints: [
      {
        id: 'omega3-cp-1',
        weekNumber: 8,
        type: 'lab-retest',
        description: 'Retest omega-3 panel to verify AA/EPA ratio improvement',
        metric: 'AA/EPA ratio',
        targetValue: 10,
        action: 'Draw omega-3 panel via Quest Labs. Target AA/EPA <15 is good, <10 is optimal.',
      },
    ],
    trajectory: [
      { weekNumber: 0, expectedValue: 30.9, rangeLow: 28, rangeHigh: 34, label: 'Baseline' },
      { weekNumber: 2, expectedValue: 27, rangeLow: 24, rangeHigh: 30 },
      { weekNumber: 4, expectedValue: 22, rangeLow: 18, rangeHigh: 26, label: 'Phase 2' },
      { weekNumber: 6, expectedValue: 16, rangeLow: 12, rangeHigh: 20 },
      { weekNumber: 8, expectedValue: 10, rangeLow: 7, rangeHigh: 15, label: 'Goal' },
    ],
    confidence: 'medium',
    reasoning:
      'AA/EPA ratio at 30.9 is significantly elevated (was 24.5 previously). EPA/DHA supplementation at 2-3 g/day typically reduces AA/EPA ratio by 2-3 points/month (Calder 2015). Combined with dietary omega-3 increase and omega-6 reduction, 8-week trajectory projects ratio from 30.9 to ~10. Confidence is medium because individual response to omega-3 supplementation varies and the ratio is currently quite high.',
    sourceInsightIds: [],
  },
]

// Helper: get all campaigns for a persona
export function getCampaignsForLoad(loadId: string): Campaign[] {
  return oronCampaigns.filter(c => c.loadId === loadId)
}
