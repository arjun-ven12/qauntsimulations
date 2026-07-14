import { afterEach,describe,expect,it } from 'vitest'; import { createDatabaseClient } from '../client.js';
describe('database client',()=>{let client:ReturnType<typeof createDatabaseClient>|undefined;afterEach(async()=>client?.$disconnect());it('loads without opening a connection',()=>{client=createDatabaseClient();expect(client).toBeDefined()})});
