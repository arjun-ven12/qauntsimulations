export interface NosanaClientConfiguration { apiKey: string; baseUrl: string; model: string }
export class NosanaClient { constructor(readonly configuration: NosanaClientConfiguration) {} }
