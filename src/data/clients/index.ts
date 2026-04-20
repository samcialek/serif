// Client Data Index
// Export all client configurations and data

export * from './humanEdge';
export * from './habitBandz';

import { humanEdgeConfig } from './humanEdge';
import { habitBandzConfig } from './habitBandz';
import type { ClientConfig } from '@/types/client';

// All client configurations
export const allClients: ClientConfig[] = [humanEdgeConfig, habitBandzConfig];

// Get client by ID
export function getClientById(id: string): ClientConfig | undefined {
  return allClients.find((c) => c.id === id);
}

// Get client names
export function getClientNames(): { id: string; name: string }[] {
  return allClients.map((c) => ({ id: c.id, name: c.name }));
}

// Summary stats for clients
export interface ClientSummary {
  id: string;
  name: string;
  logo?: string;
  dataSourceCount: number;
  xVariableCount: number;
  yVariableCount: number;
  insightCount: number;
  userCount: number;
  totalRecords: number;
}

export function getClientSummaries(): ClientSummary[] {
  return allClients.map((client) => ({
    id: client.id,
    name: client.name,
    logo: client.logo,
    dataSourceCount: client.dataSources.length,
    xVariableCount: client.xVariables.length,
    yVariableCount: client.yVariables.length,
    insightCount: client.insights.length,
    userCount: client.users.length,
    totalRecords: client.dataSources.reduce(
      (sum, ds) => sum + (ds.recordCount || 0),
      0
    ),
  }));
}

// Default export
export default allClients;
