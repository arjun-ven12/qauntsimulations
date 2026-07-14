export interface OpenAIClientConfig { apiKey: string; baseUrl: string }

export class OpenAIClient {
  constructor(private readonly config: OpenAIClientConfig) {}
  async createStructuredOutput(model: string, instructions: string, input: unknown): Promise<unknown> {
    const response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/responses`, {
      method: 'POST', headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions, input: JSON.stringify(input), text: { format: { type: 'json_object' } } }),
    });
    if (!response.ok) throw new Error(`OpenAI request failed with status ${response.status}`);
    const payload = await response.json() as { output_text?: string };
    if (!payload.output_text) throw new Error('OpenAI returned no structured output');
    return JSON.parse(payload.output_text) as unknown;
  }
}
