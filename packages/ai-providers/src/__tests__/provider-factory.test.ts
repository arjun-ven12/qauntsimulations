import { describe, expect, it } from 'vitest';
import { createAIProvider } from '../provider-factory.js';

describe('createAIProvider', () => {
  it('uses the mock when OpenAI credentials are absent', () => {
    expect(createAIProvider({ provider: 'openai', openai: { baseUrl: 'https://api.openai.com/v1', plannerModel: 'planner', explanationModel: 'explain', visionModel: 'vision' } }).name).toBe('MOCK');
  });

  it('creates OpenAI when configured', () => {
    expect(createAIProvider({ provider: 'openai', openai: { apiKey: 'test', baseUrl: 'https://api.openai.com/v1', plannerModel: 'planner', explanationModel: 'explain', visionModel: 'vision' } }).name).toBe('OPENAI');
  });

  it('creates Kimi only when explicitly selected and fully configured', () => {
    const kimi = { apiKey: 'test', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k2.6' };
    expect(createAIProvider({ provider: 'kimi', kimi }).name).toBe('KIMI');
    expect(createAIProvider({ provider: 'mock', kimi }).name).toBe('MOCK');
    expect(createAIProvider({ provider: 'kimi', kimi: { baseUrl: kimi.baseUrl, model: kimi.model } }).name).toBe('MOCK');
  });
});
