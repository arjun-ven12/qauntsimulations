import { useQuery } from '@tanstack/react-query';
import { isActiveRepairVerification, repairVerificationApi } from './repair-verification-api.js';

export const repairVerificationPollingMs = 2_000;
export function useRepairVerifications(findingId: string) {
  return useQuery({ queryKey: ['repair-verifications', 'finding', findingId], queryFn: () => repairVerificationApi.list(findingId), enabled: Boolean(findingId), refetchInterval: (query) => query.state.data?.some((item) => isActiveRepairVerification(item.executionStatus)) ? repairVerificationPollingMs : false });
}
export function useRepairVerification(verificationId: string) {
  return useQuery({ queryKey: ['repair-verification', verificationId], queryFn: () => repairVerificationApi.get(verificationId), enabled: Boolean(verificationId), refetchInterval: (query) => isActiveRepairVerification(query.state.data?.executionStatus) ? repairVerificationPollingMs : false });
}
