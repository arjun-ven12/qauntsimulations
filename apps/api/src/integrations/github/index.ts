/** Optional repository integration boundary; no GitHub access is required for the MVP. */
export interface RepositorySource { fetchRevision(repository: string, revision: string): Promise<string> }
