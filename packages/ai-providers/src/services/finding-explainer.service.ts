import type { AIProvider } from '../contracts/ai-provider.js';
import type { FindingExplanationRequest } from '../contracts/explanation.types.js';
export class FindingExplainerService { constructor(private readonly provider: AIProvider) {} explain(request: FindingExplanationRequest) { return this.provider.explainFinding(request); } }
