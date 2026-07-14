export interface InvariantService { compile(description: string): Promise<{ assertion: Record<string, unknown> }> }
