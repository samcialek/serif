// FHIR Data Index
// Unified exports and cross-resource query functions

// Re-export all types
export * from '../../types/fhir';

// Re-export all resource collections and helpers
export * from './conditions';
export * from './observations';
export * from './medications';
export * from './encounters';
export * from './diagnosticReports';

// Import for cross-resource operations
import {
  FhirResource,
  FhirCondition,
  FhirObservation,
  isCondition,
  isObservation,
  isMedicationStatement,
  isEncounter,
  isDiagnosticReport,
} from '../../types/fhir';

import { allConditions, getConditionsForPersona } from './conditions';
import { allObservations, getObservationsForPersona } from './observations';
import { allMedications, getMedicationsForPersona } from './medications';
import { allEncounters, getEncountersForPersona } from './encounters';
import {
  allDiagnosticReports,
  getDiagnosticReportsForPersona,
} from './diagnosticReports';

// ============================================================================
// Unified Resource Access
// ============================================================================

/**
 * Get all FHIR resources across all types
 */
export function getAllResources(): FhirResource[] {
  return [
    ...allConditions,
    ...allObservations,
    ...allMedications,
    ...allEncounters,
    ...allDiagnosticReports,
  ];
}

/**
 * Get all FHIR resources for a specific persona
 */
export function getAllResourcesForPersona(personaId: string): FhirResource[] {
  return [
    ...getConditionsForPersona(personaId),
    ...getObservationsForPersona(personaId),
    ...getMedicationsForPersona(personaId),
    ...getEncountersForPersona(personaId),
    ...getDiagnosticReportsForPersona(personaId),
  ];
}

/**
 * Get a resource by ID across all types
 */
export function getResourceById(id: string): FhirResource | undefined {
  return getAllResources().find((r) => r.id === id);
}

/**
 * Get resources by type for a persona
 */
export function getResourcesByType(
  personaId: string,
  resourceType: FhirResource['resourceType']
): FhirResource[] {
  switch (resourceType) {
    case 'Condition':
      return getConditionsForPersona(personaId);
    case 'Observation':
      return getObservationsForPersona(personaId);
    case 'MedicationStatement':
      return getMedicationsForPersona(personaId);
    case 'Encounter':
      return getEncountersForPersona(personaId);
    case 'DiagnosticReport':
      return getDiagnosticReportsForPersona(personaId);
    default:
      return [];
  }
}

// ============================================================================
// Data Source Analytics
// ============================================================================

export type DataSource =
  | 'CommonWell'
  | 'Carequality'
  | 'Surescripts'
  | 'Quest'
  | 'Bamboo'
  | 'Manual'
  | 'Wearable';

interface SourceStats {
  source: DataSource;
  resourceCount: number;
  resourceTypes: Record<string, number>;
  lastUpdated: string | null;
}

/**
 * Get statistics about data sources for a persona
 */
export function getDataSourceStats(personaId: string): SourceStats[] {
  const resources = getAllResourcesForPersona(personaId);
  const sourceMap = new Map<
    DataSource,
    { count: number; types: Record<string, number>; lastUpdated: Date | null }
  >();

  resources.forEach((resource) => {
    const source = (resource.meta?.source as DataSource) || 'Manual';
    const existing = sourceMap.get(source) || {
      count: 0,
      types: {},
      lastUpdated: null,
    };

    existing.count++;
    existing.types[resource.resourceType] =
      (existing.types[resource.resourceType] || 0) + 1;

    if (resource.meta?.lastUpdated) {
      const resourceDate = new Date(resource.meta.lastUpdated);
      if (!existing.lastUpdated || resourceDate > existing.lastUpdated) {
        existing.lastUpdated = resourceDate;
      }
    }

    sourceMap.set(source, existing);
  });

  return Array.from(sourceMap.entries()).map(([source, data]) => ({
    source,
    resourceCount: data.count,
    resourceTypes: data.types,
    lastUpdated: data.lastUpdated?.toISOString() || null,
  }));
}

// ============================================================================
// Insight Linking
// ============================================================================

/**
 * Find all resources linked to a specific insight
 */
export function getResourcesLinkedToInsight(
  personaId: string,
  insightId: string
): FhirResource[] {
  const resources = getAllResourcesForPersona(personaId);

  return resources.filter((resource) => {
    // Check Serif extension for linked insights
    if ('_serifLinkedInsights' in resource) {
      const linked = (resource as FhirCondition | FhirObservation)
        ._serifLinkedInsights;
      if (linked?.includes(insightId)) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Get clinical context summary for an insight
 */
export interface ClinicalContextSummary {
  conditions: {
    id: string;
    display: string;
    code: string;
    status: string;
  }[];
  recentLabs: {
    id: string;
    display: string;
    value: string;
    interpretation: string;
    date: string;
  }[];
  medications: {
    id: string;
    display: string;
    adherence: number;
    status: string;
  }[];
  recentVisits: {
    id: string;
    type: string;
    provider: string;
    date: string;
  }[];
}

export function getClinicalContextForInsight(
  personaId: string,
  insightId: string
): ClinicalContextSummary {
  const linkedResources = getResourcesLinkedToInsight(personaId, insightId);

  const conditions: ClinicalContextSummary['conditions'] = [];
  const recentLabs: ClinicalContextSummary['recentLabs'] = [];
  const medications: ClinicalContextSummary['medications'] = [];
  const recentVisits: ClinicalContextSummary['recentVisits'] = [];

  linkedResources.forEach((resource) => {
    if (isCondition(resource)) {
      conditions.push({
        id: resource.id,
        display: resource.code.coding?.[0]?.display || 'Unknown',
        code: resource.code.coding?.[0]?.code || '',
        status: resource.clinicalStatus?.coding?.[0]?.code || 'unknown',
      });
    } else if (isObservation(resource)) {
      const value = resource.valueQuantity
        ? `${resource.valueQuantity.value} ${resource.valueQuantity.unit || ''}`
        : 'N/A';
      recentLabs.push({
        id: resource.id,
        display: resource.code.coding?.[0]?.display || 'Unknown',
        value,
        interpretation: resource.interpretation?.[0]?.coding?.[0]?.code || 'N',
        date: resource.effectiveDateTime || '',
      });
    } else if (isMedicationStatement(resource)) {
      medications.push({
        id: resource.id,
        display:
          resource.medicationCodeableConcept?.coding?.[0]?.display || 'Unknown',
        adherence: resource._serifAdherence || 100,
        status: resource.status,
      });
    } else if (isEncounter(resource)) {
      recentVisits.push({
        id: resource.id,
        type: resource._serifEncounterType || 'visit',
        provider: resource.participant?.[0]?.individual?.display || 'Unknown',
        date: resource.period?.start || '',
      });
    }
  });

  return {
    conditions,
    recentLabs: recentLabs.slice(0, 5), // Most recent 5
    medications,
    recentVisits: recentVisits.slice(0, 3), // Most recent 3
  };
}

// ============================================================================
// Timeline Generation
// ============================================================================

export interface TimelineEvent {
  id: string;
  resourceType: FhirResource['resourceType'];
  date: Date;
  title: string;
  subtitle: string;
  source: DataSource;
  resource: FhirResource;
}

/**
 * Generate a unified timeline of clinical events for a persona
 */
export function generateClinicalTimeline(
  personaId: string,
  startDate?: Date,
  endDate?: Date
): TimelineEvent[] {
  const resources = getAllResourcesForPersona(personaId);
  const events: TimelineEvent[] = [];

  resources.forEach((resource) => {
    let date: Date | null = null;
    let title = '';
    let subtitle = '';

    if (isCondition(resource)) {
      date = resource.onsetDateTime
        ? new Date(resource.onsetDateTime)
        : resource.recordedDate
          ? new Date(resource.recordedDate)
          : null;
      title = resource.code.coding?.[0]?.display || 'Condition';
      subtitle = `Status: ${resource.clinicalStatus?.coding?.[0]?.code || 'unknown'}`;
    } else if (isObservation(resource)) {
      date = resource.effectiveDateTime
        ? new Date(resource.effectiveDateTime)
        : null;
      title = resource.code.coding?.[0]?.display || 'Observation';
      const value = resource.valueQuantity
        ? `${resource.valueQuantity.value} ${resource.valueQuantity.unit || ''}`
        : 'N/A';
      subtitle = value;
    } else if (isMedicationStatement(resource)) {
      date = resource.effectivePeriod?.start
        ? new Date(resource.effectivePeriod.start)
        : null;
      title =
        resource.medicationCodeableConcept?.coding?.[0]?.display ||
        'Medication';
      subtitle = resource.dosage?.[0]?.text || '';
    } else if (isEncounter(resource)) {
      date = resource.period?.start ? new Date(resource.period.start) : null;
      title =
        resource._serifEncounterType?.replace('-', ' ').toUpperCase() ||
        'Encounter';
      subtitle =
        resource.reasonCode?.[0]?.coding?.[0]?.display || 'Clinical visit';
    } else if (isDiagnosticReport(resource)) {
      date = resource.effectiveDateTime
        ? new Date(resource.effectiveDateTime)
        : null;
      title = resource.code.coding?.[0]?.display || 'Lab Report';
      subtitle = resource.conclusion || '';
    }

    if (date) {
      // Apply date filters if provided
      if (startDate && date < startDate) return;
      if (endDate && date > endDate) return;

      events.push({
        id: resource.id,
        resourceType: resource.resourceType,
        date,
        title,
        subtitle,
        source: (resource.meta?.source as DataSource) || 'Manual',
        resource,
      });
    }
  });

  // Sort by date descending (most recent first)
  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}

// ============================================================================
// Summary Statistics
// ============================================================================

export interface PersonaClinicalSummary {
  personaId: string;
  totalResources: number;
  byType: Record<FhirResource['resourceType'], number>;
  bySource: Record<DataSource, number>;
  activeConditions: number;
  activeMedications: number;
  recentEncounters: number; // Last 90 days
  labsInPast30Days: number;
}

export function getPersonaClinicalSummary(
  personaId: string
): PersonaClinicalSummary {
  const resources = getAllResourcesForPersona(personaId);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const byType: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  let activeConditions = 0;
  let activeMedications = 0;
  let recentEncounters = 0;
  let labsInPast30Days = 0;

  resources.forEach((resource) => {
    // Count by type
    byType[resource.resourceType] = (byType[resource.resourceType] || 0) + 1;

    // Count by source
    const source = (resource.meta?.source as DataSource) || 'Manual';
    bySource[source] = (bySource[source] || 0) + 1;

    // Specific counts
    if (isCondition(resource)) {
      if (resource.clinicalStatus?.coding?.[0]?.code === 'active') {
        activeConditions++;
      }
    } else if (isMedicationStatement(resource)) {
      if (resource.status === 'active') {
        activeMedications++;
      }
    } else if (isEncounter(resource)) {
      const encounterDate = resource.period?.start
        ? new Date(resource.period.start)
        : null;
      if (encounterDate && encounterDate >= ninetyDaysAgo) {
        recentEncounters++;
      }
    } else if (isObservation(resource)) {
      const labDate = resource.effectiveDateTime
        ? new Date(resource.effectiveDateTime)
        : null;
      if (labDate && labDate >= thirtyDaysAgo) {
        labsInPast30Days++;
      }
    }
  });

  return {
    personaId,
    totalResources: resources.length,
    byType: byType as Record<FhirResource['resourceType'], number>,
    bySource: bySource as Record<DataSource, number>,
    activeConditions,
    activeMedications,
    recentEncounters,
    labsInPast30Days,
  };
}

// ============================================================================
// Search Functionality
// ============================================================================

export interface SearchResult {
  resource: FhirResource;
  matchedField: string;
  matchedValue: string;
  score: number;
}

/**
 * Search across all FHIR resources for a persona
 */
export function searchResources(
  personaId: string,
  query: string,
  resourceTypes?: FhirResource['resourceType'][]
): SearchResult[] {
  const resources = getAllResourcesForPersona(personaId);
  const results: SearchResult[] = [];
  const lowerQuery = query.toLowerCase();

  resources.forEach((resource) => {
    // Filter by resource type if specified
    if (resourceTypes && !resourceTypes.includes(resource.resourceType)) {
      return;
    }

    // Search in common fields
    const searchFields: { field: string; value: string }[] = [];

    // Resource ID
    searchFields.push({ field: 'id', value: resource.id });

    // Code/display values (for Condition, Observation, DiagnosticReport)
    if (isCondition(resource) || isObservation(resource) || isDiagnosticReport(resource)) {
      const coding = resource.code?.coding?.[0];
      if (coding) {
        searchFields.push({
          field: 'code.display',
          value: coding.display || '',
        });
        searchFields.push({
          field: 'code.code',
          value: coding.code || '',
        });
      }
    }

    // Medication name
    if (isMedicationStatement(resource)) {
      const coding = resource.medicationCodeableConcept?.coding?.[0];
      if (coding) {
        searchFields.push({
          field: 'medication',
          value: coding.display || '',
        });
      }
    }

    // Encounter reason
    if (isEncounter(resource)) {
      const coding = resource.reasonCode?.[0]?.coding?.[0];
      if (coding) {
        searchFields.push({
          field: 'reason',
          value: coding.display || '',
        });
      }
    }

    // DiagnosticReport conclusion
    if (isDiagnosticReport(resource) && resource.conclusion) {
      searchFields.push({ field: 'conclusion', value: resource.conclusion });
    }

    // Check each field for matches
    searchFields.forEach(({ field, value }) => {
      if (value.toLowerCase().includes(lowerQuery)) {
        const score = value.toLowerCase() === lowerQuery ? 100 : 50;
        results.push({
          resource,
          matchedField: field,
          matchedValue: value,
          score,
        });
      }
    });
  });

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}
