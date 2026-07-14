/** World persistence and lifecycle services are owned by the runtime developer. */
export interface WorldQueueService { queue(worldId: string): Promise<void> }
