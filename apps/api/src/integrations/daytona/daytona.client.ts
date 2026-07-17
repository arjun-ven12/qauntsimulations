import { Daytona } from '@daytona/sdk';

export interface DaytonaClientConfiguration {
  apiKey: string;
  apiUrl?: string;
  target: 'eu';
  snapshot?: string;
}

export class DaytonaClient {
  readonly sdk: Daytona;

  constructor(readonly configuration: DaytonaClientConfiguration) {
    this.sdk = new Daytona({
      apiKey: configuration.apiKey,
      target: configuration.target,
      ...(configuration.apiUrl ? { apiUrl: configuration.apiUrl } : {}),
    });
  }
}
