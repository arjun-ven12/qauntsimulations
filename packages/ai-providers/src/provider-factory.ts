import type { AIProvider } from './contracts/ai-provider.js';
import { KimiClient } from './providers/kimi/kimi.client.js';
import { KimiProvider } from './providers/kimi/kimi.provider.js';
import { MockAIProvider } from './providers/mock/mock.provider.js';
import { OpenAIClient } from './providers/openai/openai.client.js';
import { OpenAIProvider } from './providers/openai/openai.provider.js';

export interface AIProviderConfiguration { provider: 'openai' | 'kimi' | 'mock'; openai?: { apiKey?: string; baseUrl: string; plannerModel: string; explanationModel: string; visionModel: string }; kimi?: { apiKey?: string; baseUrl: string; model?: string } }
export function createAIProvider(config: AIProviderConfiguration): AIProvider {
  if (config.provider === 'openai' && config.openai?.apiKey) return new OpenAIProvider(new OpenAIClient({ apiKey: config.openai.apiKey, baseUrl: config.openai.baseUrl }), { planner: config.openai.plannerModel, explanation: config.openai.explanationModel, vision: config.openai.visionModel });
  if (config.provider === 'kimi' && config.kimi?.apiKey && config.kimi.model) return new KimiProvider(new KimiClient({ apiKey: config.kimi.apiKey, baseUrl: config.kimi.baseUrl, model: config.kimi.model }));
  return new MockAIProvider();
}
