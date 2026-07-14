import type { Logger } from 'pino';
import type { AuthContext } from '../modules/auth/auth.types.js';
declare global { namespace Express { interface Request { auth?: AuthContext; id?: string; log?: Logger } } }
export {};
