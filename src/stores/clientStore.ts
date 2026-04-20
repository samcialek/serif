import { create } from 'zustand';
import type {
  ClientConfig,
  DataSource,
  XVariable,
  YVariable,
  ClientInsight,
  ClientUser,
} from '@/types/client';
import {
  allClients,
  getClientById,
  getClientSummaries,
  type ClientSummary,
} from '@/data/clients';
import {
  getUserDetail,
  type HumanEdgeUserDetail,
  type HabitBandzUserDetail,
} from '@/data/clients/userData';

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'overview' | 'data-sources' | 'variables' | 'insights' | 'users';

export type UserDetailData = HumanEdgeUserDetail | HabitBandzUserDetail;

interface ClientFilters {
  dataSourceTypes: string[];
  variableCategories: string[];
  searchQuery: string;
}

interface ClientState {
  // Current client selection
  activeClientId: string | null;
  activeClient: ClientConfig | null;

  // View state
  viewMode: ViewMode;
  selectedDataSourceId: string | null;
  selectedInsightId: string | null;
  selectedUserId: string | null;

  // User detail state
  userDetail: UserDetailData | null;
  userDetailLoading: boolean;

  // Filters
  filters: ClientFilters;

  // Cached data
  clientSummaries: ClientSummary[];

  // Actions
  setActiveClient: (clientId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedDataSource: (id: string | null) => void;
  setSelectedInsight: (id: string | null) => void;
  setSelectedUser: (id: string | null) => void;
  loadUserDetail: (clientId: string, userId: string) => void;
  clearUserDetail: () => void;
  setFilters: (filters: Partial<ClientFilters>) => void;
  resetFilters: () => void;

  // Getters
  getDataSources: () => DataSource[];
  getXVariables: () => XVariable[];
  getYVariables: () => YVariable[];
  getInsights: () => ClientInsight[];
  getUsers: () => ClientUser[];
  getDataSourceById: (id: string) => DataSource | undefined;
  getInsightById: (id: string) => ClientInsight | undefined;
  getUserById: (id: string) => ClientUser | undefined;
  getFilteredXVariables: () => XVariable[];
  getFilteredInsights: () => ClientInsight[];
}

const defaultFilters: ClientFilters = {
  dataSourceTypes: [],
  variableCategories: [],
  searchQuery: '',
};

// ============================================================================
// Store
// ============================================================================

export const useClientStore = create<ClientState>((set, get) => ({
  // Initial state
  activeClientId: null,
  activeClient: null,
  viewMode: 'overview',
  selectedDataSourceId: null,
  selectedInsightId: null,
  selectedUserId: null,
  userDetail: null,
  userDetailLoading: false,
  filters: { ...defaultFilters },
  clientSummaries: getClientSummaries(),

  // Actions
  setActiveClient: (clientId: string) => {
    const client = getClientById(clientId);
    set({
      activeClientId: clientId,
      activeClient: client || null,
      selectedDataSourceId: null,
      selectedInsightId: null,
      selectedUserId: null,
      userDetail: null,
      filters: { ...defaultFilters },
    });
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },

  setSelectedDataSource: (id: string | null) => {
    set({ selectedDataSourceId: id });
  },

  setSelectedInsight: (id: string | null) => {
    set({ selectedInsightId: id });
  },

  setSelectedUser: (id: string | null) => {
    set({ selectedUserId: id });
  },

  loadUserDetail: (clientId: string, userId: string) => {
    set({ userDetailLoading: true });
    // Simulate async loading
    setTimeout(() => {
      const detail = getUserDetail(clientId, userId);
      set({
        userDetail: detail || null,
        userDetailLoading: false,
        selectedUserId: userId,
        activeClientId: clientId,
        activeClient: getClientById(clientId) || null,
      });
    }, 100);
  },

  clearUserDetail: () => {
    set({
      userDetail: null,
      selectedUserId: null,
    });
  },

  setFilters: (newFilters: Partial<ClientFilters>) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },

  resetFilters: () => {
    set({ filters: { ...defaultFilters } });
  },

  // Getters
  getDataSources: () => {
    const client = get().activeClient;
    return client?.dataSources || [];
  },

  getXVariables: () => {
    const client = get().activeClient;
    return client?.xVariables || [];
  },

  getYVariables: () => {
    const client = get().activeClient;
    return client?.yVariables || [];
  },

  getInsights: () => {
    const client = get().activeClient;
    return client?.insights || [];
  },

  getUsers: () => {
    const client = get().activeClient;
    return client?.users || [];
  },

  getDataSourceById: (id: string) => {
    return get().getDataSources().find((ds) => ds.id === id);
  },

  getInsightById: (id: string) => {
    return get().getInsights().find((i) => i.id === id);
  },

  getUserById: (id: string) => {
    return get().getUsers().find((u) => u.id === id);
  },

  getFilteredXVariables: () => {
    const { filters } = get();
    let variables = get().getXVariables();

    // Filter by data source type
    if (filters.dataSourceTypes.length > 0) {
      variables = variables.filter((v) =>
        filters.dataSourceTypes.includes(v.dataSource)
      );
    }

    // Filter by category
    if (filters.variableCategories.length > 0) {
      variables = variables.filter((v) =>
        filters.variableCategories.includes(v.category)
      );
    }

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      variables = variables.filter(
        (v) =>
          v.name.toLowerCase().includes(query) ||
          v.description.toLowerCase().includes(query)
      );
    }

    return variables;
  },

  getFilteredInsights: () => {
    const { filters } = get();
    let insights = get().getInsights();

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      insights = insights.filter(
        (i) =>
          i.title.toLowerCase().includes(query) ||
          i.description.toLowerCase().includes(query)
      );
    }

    return insights;
  },
}));

// ============================================================================
// Selector Hooks
// ============================================================================

export const useActiveClient = () => {
  return useClientStore((state) => state.activeClient);
};

export const useClientSummaries = () => {
  return useClientStore((state) => state.clientSummaries);
};

export const useClientDataSources = () => {
  const client = useClientStore((state) => state.activeClient);
  return client?.dataSources || [];
};

export const useClientXVariables = () => {
  const client = useClientStore((state) => state.activeClient);
  return client?.xVariables || [];
};

export const useClientYVariables = () => {
  const client = useClientStore((state) => state.activeClient);
  return client?.yVariables || [];
};

export const useClientInsights = () => {
  const client = useClientStore((state) => state.activeClient);
  return client?.insights || [];
};

export const useClientUsers = () => {
  const client = useClientStore((state) => state.activeClient);
  return client?.users || [];
};

export const useSelectedDataSource = () => {
  const selectedId = useClientStore((state) => state.selectedDataSourceId);
  const dataSources = useClientDataSources();
  return selectedId ? dataSources.find((ds) => ds.id === selectedId) : null;
};

export const useSelectedInsight = () => {
  const selectedId = useClientStore((state) => state.selectedInsightId);
  const insights = useClientInsights();
  return selectedId ? insights.find((i) => i.id === selectedId) : null;
};

// Hook to get all unique categories from X variables
export const useXVariableCategories = () => {
  const xVariables = useClientXVariables();
  const categories = [...new Set(xVariables.map((v) => v.category))];
  return categories.sort();
};

// Hook to get all unique data source types from X variables
export const useDataSourceTypes = () => {
  const xVariables = useClientXVariables();
  const types = [...new Set(xVariables.map((v) => v.dataSource))];
  return types;
};

// Hook to get data pipeline stats
export const useDataPipelineStats = () => {
  const dataSources = useClientDataSources();

  const totalRecords = dataSources.reduce(
    (sum, ds) => sum + (ds.recordCount || 0),
    0
  );

  const activeCount = dataSources.filter((ds) => ds.status === 'active').length;
  const errorCount = dataSources.filter((ds) => ds.status === 'error').length;

  const lastSync = dataSources.reduce((latest, ds) => {
    if (!ds.lastSync) return latest;
    const dsDate = new Date(ds.lastSync);
    return dsDate > latest ? dsDate : latest;
  }, new Date(0));

  return {
    totalSources: dataSources.length,
    totalRecords,
    activeCount,
    errorCount,
    lastSync: lastSync.getTime() > 0 ? lastSync.toISOString() : null,
  };
};

// Hook to get insight-variable mapping
export const useInsightVariableMap = (insightId: string) => {
  const xVariables = useClientXVariables();
  const yVariables = useClientYVariables();
  const insights = useClientInsights();

  const insight = insights.find((i) => i.id === insightId);
  if (!insight) return { insight: null, xVars: [], yVar: null };

  const xVars = insight.xVariables
    .map((xId) => xVariables.find((v) => v.id === xId))
    .filter(Boolean);

  const yVar = yVariables.find((v) => v.id === insight.yVariable);

  return { insight, xVars, yVar };
};

// ============================================================================
// User Detail Hooks
// ============================================================================

export const useUserDetail = () => {
  return useClientStore((state) => state.userDetail);
};

export const useUserDetailLoading = () => {
  return useClientStore((state) => state.userDetailLoading);
};

export const useSelectedUser = () => {
  const selectedId = useClientStore((state) => state.selectedUserId);
  const users = useClientUsers();
  return selectedId ? users.find((u) => u.id === selectedId) : null;
};

// Type guard for Human Edge user detail
export function isHumanEdgeUserDetail(
  detail: UserDetailData | null
): detail is HumanEdgeUserDetail {
  if (!detail) return false;
  return 'cgmReadings' in detail;
}

