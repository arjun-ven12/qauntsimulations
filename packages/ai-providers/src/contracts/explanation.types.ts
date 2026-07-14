export interface FindingExplanationRequest { title: string; observations: string[]; evidenceReferences: string[] }
export interface EvidenceSummaryRequest { artifactDescriptions: string[]; invariantViolations: string[] }
export interface EvidenceBackedExplanation { summary: string; supportingEvidence: string[]; limitations: string[] }
