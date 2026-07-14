/** Repair records point to a deployment or commit; they never mutate repositories directly. */
export interface RepairService { register(findingId: string, reference: string): Promise<string> }
