export interface WorldPackRegistry { list(): Promise<Array<{ identifier: string; version: string }>> }
