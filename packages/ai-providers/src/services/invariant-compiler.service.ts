import type { AIProvider } from '../contracts/ai-provider.js';
export class InvariantCompilerService { constructor(private readonly provider: AIProvider) {} compile(description: string) { return this.provider.compileInvariant(description); } }
