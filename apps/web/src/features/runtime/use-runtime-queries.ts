import { useQuery } from '@tanstack/react-query';
import { investigationApi } from '../../services/api/index.js';
import { isTerminalStatus } from './runtime-normalizers.js';

export const polling = {
  progressMs: 2_000,
  worldsMs: 3_000,
  workersMs: 3_000,
  findingsMs: 5_000,
  evidenceMs: 5_000,
};

export function useInvestigationProgress(investigationId: string) {
  return useQuery({
    queryKey: ['investigation', investigationId, 'progress'],
    queryFn: () => investigationApi.getInvestigation(investigationId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && isTerminalStatus(status) ? false : polling.progressMs;
    },
  });
}

export function useExperimentPlan(investigationId: string) {
  return useQuery({
    queryKey: ['investigation', investigationId, 'plan'],
    queryFn: () => investigationApi.getExperimentPlan(investigationId),
  });
}

export function useInvestigationWorlds(investigationId: string, status?: string) {
  return useQuery({
    queryKey: ['investigation', investigationId, 'worlds'],
    queryFn: () => investigationApi.getWorlds(investigationId),
    refetchInterval: status && isTerminalStatus(status) ? false : polling.worldsMs,
  });
}

export function useInvestigationExperiments(investigationId: string, status?: string) {
  return useQuery({
    queryKey: ['investigation', investigationId, 'experiments'],
    queryFn: () => investigationApi.getExperiments(investigationId),
    refetchInterval: status && isTerminalStatus(status) ? false : polling.worldsMs,
  });
}

export function useInvestigationWorkers(investigationId: string, status?: string) {
  return useQuery({
    queryKey: ['investigation', investigationId, 'workers'],
    queryFn: () => investigationApi.getWorkers(investigationId),
    refetchInterval: status && isTerminalStatus(status) ? false : polling.workersMs,
  });
}

export function useInvestigationEvidence(investigationId: string, status?: string) {
  return useQuery({
    queryKey: ['investigation', investigationId, 'evidence'],
    queryFn: () => investigationApi.getEvidence(investigationId),
    refetchInterval: status && isTerminalStatus(status) ? false : polling.evidenceMs,
  });
}

export function useInvestigationFindings(investigationId: string, status?: string) {
  return useQuery({
    queryKey: ['investigation', investigationId, 'findings'],
    queryFn: () => investigationApi.listFindings(investigationId),
    refetchInterval: status && isTerminalStatus(status) ? false : polling.findingsMs,
  });
}

export function useFindingDetail(investigationId: string, findingId: string) {
  return useQuery({
    queryKey: ['investigation', investigationId, 'findings', findingId],
    queryFn: () => investigationApi.getFindingDetail(investigationId, findingId),
  });
}

