export interface DaytonaClientConfiguration { apiKey: string; apiUrl?: string; target?: string; snapshot?: string }
export class DaytonaClient { constructor(readonly configuration: DaytonaClientConfiguration) {} }
