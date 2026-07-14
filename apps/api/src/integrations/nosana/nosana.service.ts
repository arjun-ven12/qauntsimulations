import type { NosanaVisualAnalysisProvider, VisualAnalysisJob, VisualAnalysisResult } from './nosana.types.js';
export class MockNosanaService implements NosanaVisualAnalysisProvider {
  async submitVisualAnalysisJob(images: string[]): Promise<VisualAnalysisJob> { return { id: `mock-${images.length}`, status: 'COMPLETED', result: await this.analyseScreenshotBatch(images) }; }
  async getVisualAnalysisJob(id: string): Promise<VisualAnalysisJob> { return { id, status: 'COMPLETED', result: { summary: 'Nosana disabled; no visual inference was run.', observations: [] } }; }
  async cancelVisualAnalysisJob(_id: string): Promise<void> {} async analyseScreenshotBatch(_images: string[]): Promise<VisualAnalysisResult> { return { summary: 'Nosana disabled; screenshots retained for later analysis.', observations: [] }; }
  async compareSuccessfulAndFailedRuns(_successful: string[], _failed: string[]): Promise<VisualAnalysisResult> { return { summary: 'Nosana disabled; run comparison skipped.', observations: [] }; }
}
