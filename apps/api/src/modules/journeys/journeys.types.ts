export interface JourneyStepInput { order: number; action: string; selector: string | null; value: string | null; metadata: Record<string, unknown> }
export interface CreateJourneyInput { name: string; description: string | null; steps: JourneyStepInput[] }
