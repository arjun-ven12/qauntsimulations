export interface KimiClientConfig { apiKey: string; baseUrl: string; model: string }
export class KimiClient { constructor(readonly config: KimiClientConfig) {} }
