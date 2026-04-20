import { create } from 'zustand';
import type {
  FhirResource,
  FhirCondition,
  FhirObservation,
  FhirMedicationStatement,
  FhirEncounter,
  FhirDiagnosticReport,
} from '@/types/fhir';
import {
  getAllResourcesForPersona,
  getConditionsForPersona,
  getObservationsForPersona,
  getMedicationsForPersona,
  getEncountersForPersona,
  getDiagnosticReportsForPersona,
  getDataSourceStats,
  generateClinicalTimeline,
  getClinicalContextForInsight,
  getPersonaClinicalSummary,
  searchResources,
  type DataSource,
  type TimelineEvent,
  type ClinicalContextSummary,
  type PersonaClinicalSummary,
  type SearchResult,
} from '@/data/fhir';

// ============================================================================
// Types
// ============================================================================

type ResourceType = FhirResource['resourceType'];

interface FhirFilters {
  resourceTypes: ResourceType[];
  sources: DataSource[];
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  searchQuery: string;
}

interface FhirState {
  // Current persona's FHIR data
  personaId: string | null;
  resources: FhirResource[];
  isLoading: boolean;

  // Filters and view state
  filters: FhirFilters;
  selectedResourceId: string | null;
  viewMode: 'list' | 'timeline' | 'sources';

  // Cached derived data
  timeline: TimelineEvent[];
  sourceStats: ReturnType<typeof getDataSourceStats>;
  summary: PersonaClinicalSummary | null;

  // Actions
  loadPersonaData: (personaId: string) => void;
  setFilters: (filters: Partial<FhirFilters>) => void;
  resetFilters: () => void;
  setSelectedResource: (id: string | null) => void;
  setViewMode: (mode: 'list' | 'timeline' | 'sources') => void;

  // Getters
  getFilteredResources: () => FhirResource[];
  getResourceById: (id: string) => FhirResource | undefined;
  getConditions: () => FhirCondition[];
  getObservations: () => FhirObservation[];
  getMedications: () => FhirMedicationStatement[];
  getEncounters: () => FhirEncounter[];
  getDiagnosticReports: () => FhirDiagnosticReport[];
  getClinicalContext: (insightId: string) => ClinicalContextSummary;
  search: (query: string) => SearchResult[];
}

const defaultFilters: FhirFilters = {
  resourceTypes: [],
  sources: [],
  dateRange: {
    start: null,
    end: null,
  },
  searchQuery: '',
};

// ============================================================================
// Store
// ============================================================================

export const useFhirStore = create<FhirState>((set, get) => ({
  // Initial state
  personaId: null,
  resources: [],
  isLoading: false,
  filters: { ...defaultFilters },
  selectedResourceId: null,
  viewMode: 'list',
  timeline: [],
  sourceStats: [],
  summary: null,

  // Actions
  loadPersonaData: (personaId: string) => {
    set({ isLoading: true, personaId });

    // Load all resources for the persona
    const resources = getAllResourcesForPersona(personaId);
    const timeline = generateClinicalTimeline(personaId);
    const sourceStats = getDataSourceStats(personaId);
    const summary = getPersonaClinicalSummary(personaId);

    set({
      resources,
      timeline,
      sourceStats,
      summary,
      isLoading: false,
    });
  },

  setFilters: (newFilters: Partial<FhirFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },

  resetFilters: () => {
    set({ filters: { ...defaultFilters } });
  },

  setSelectedResource: (id: string | null) => {
    set({ selectedResourceId: id });
  },

  setViewMode: (mode: 'list' | 'timeline' | 'sources') => {
    set({ viewMode: mode });
  },

  // Getters
  getFilteredResources: () => {
    const { resources, filters } = get();
    let filtered = [...resources];

    // Filter by resource type
    if (filters.resourceTypes.length > 0) {
      filtered = filtered.filter((r) =>
        filters.resourceTypes.includes(r.resourceType)
      );
    }

    // Filter by source
    if (filters.sources.length > 0) {
      filtered = filtered.filter((r) =>
        filters.sources.includes((r.meta?.source as DataSource) || 'Manual')
      );
    }

    // Filter by search query
    if (filters.searchQuery) {
      const searchResults = searchResources(
        get().personaId || '',
        filters.searchQuery
      );
      const matchedIds = new Set(searchResults.map((r) => r.resource.id));
      filtered = filtered.filter((r) => matchedIds.has(r.id));
    }

    return filtered;
  },

  getResourceById: (id: string) => {
    return get().resources.find((r) => r.id === id);
  },

  getConditions: () => {
    const personaId = get().personaId;
    return personaId ? getConditionsForPersona(personaId) : [];
  },

  getObservations: () => {
    const personaId = get().personaId;
    return personaId ? getObservationsForPersona(personaId) : [];
  },

  getMedications: () => {
    const personaId = get().personaId;
    return personaId ? getMedicationsForPersona(personaId) : [];
  },

  getEncounters: () => {
    const personaId = get().personaId;
    return personaId ? getEncountersForPersona(personaId) : [];
  },

  getDiagnosticReports: () => {
    const personaId = get().personaId;
    return personaId ? getDiagnosticReportsForPersona(personaId) : [];
  },

  getClinicalContext: (insightId: string) => {
    const personaId = get().personaId;
    return personaId
      ? getClinicalContextForInsight(personaId, insightId)
      : {
          conditions: [],
          recentLabs: [],
          medications: [],
          recentVisits: [],
        };
  },

  search: (query: string) => {
    const personaId = get().personaId;
    return personaId ? searchResources(personaId, query) : [];
  },
}));

// ============================================================================
// Selector Hooks
// ============================================================================

export const useFhirResources = () => {
  return useFhirStore((state) => state.resources);
};

export const useFhirFilters = () => {
  return useFhirStore((state) => state.filters);
};

export const useFhirTimeline = () => {
  return useFhirStore((state) => state.timeline);
};

export const useFhirSourceStats = () => {
  return useFhirStore((state) => state.sourceStats);
};

export const useFhirSummary = () => {
  return useFhirStore((state) => state.summary);
};

export const useSelectedFhirResource = () => {
  const selectedId = useFhirStore((state) => state.selectedResourceId);
  const resources = useFhirStore((state) => state.resources);
  return selectedId ? resources.find((r) => r.id === selectedId) : null;
};

export const useFhirConditions = () => {
  const personaId = useFhirStore((state) => state.personaId);
  return personaId ? getConditionsForPersona(personaId) : [];
};

export const useFhirObservations = () => {
  const personaId = useFhirStore((state) => state.personaId);
  return personaId ? getObservationsForPersona(personaId) : [];
};

export const useFhirMedications = () => {
  const personaId = useFhirStore((state) => state.personaId);
  return personaId ? getMedicationsForPersona(personaId) : [];
};

export const useFhirEncounters = () => {
  const personaId = useFhirStore((state) => state.personaId);
  return personaId ? getEncountersForPersona(personaId) : [];
};

export const useFhirDiagnosticReports = () => {
  const personaId = useFhirStore((state) => state.personaId);
  return personaId ? getDiagnosticReportsForPersona(personaId) : [];
};

// Hook to get clinical context for a specific insight
export const useClinicalContext = (insightId: string) => {
  const personaId = useFhirStore((state) => state.personaId);
  if (!personaId) {
    return {
      conditions: [],
      recentLabs: [],
      medications: [],
      recentVisits: [],
    };
  }
  return getClinicalContextForInsight(personaId, insightId);
};

// Hook to load FHIR data when persona changes
export const useLoadFhirData = (personaId: string | undefined) => {
  const loadPersonaData = useFhirStore((state) => state.loadPersonaData);
  const currentPersonaId = useFhirStore((state) => state.personaId);

  if (personaId && personaId !== currentPersonaId) {
    loadPersonaData(personaId);
  }
};
