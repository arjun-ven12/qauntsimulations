/** Finding confirmation combines invariant violations, reproduction evidence, and confidence. */
export interface FindingConfirmationService { confirm(findingId: string): Promise<void> }
