export interface VisualAnalysisRequest { imageReferences: string[]; question: string }
export interface VisualAnalysisResult { summary: string; observations: Array<{ description: string; imageReference: string; confidence: number }> }
