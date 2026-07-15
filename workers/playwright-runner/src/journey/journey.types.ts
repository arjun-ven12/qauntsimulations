import type { JourneyAction, JourneyStep } from '@taskos/execution-contracts';
export interface FailedJourneyStep { index: number; name?: string; type: string; selector?: string; error: string }
export interface JourneyExecutionResult { completed: boolean; completedSteps: number; totalSteps: number; actions: JourneyAction[]; failedStep?: FailedJourneyStep }
export function stepSelector(step: JourneyStep): string | undefined { return 'selector' in step ? step.selector : undefined; }
