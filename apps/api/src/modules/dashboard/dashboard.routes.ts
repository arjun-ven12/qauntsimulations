import { Router } from 'express';
import type { DashboardController } from './dashboard.controller.js';
export function createDashboardRouter(controller: DashboardController): Router { const router = Router(); router.get('/current/activity', controller.activity); return router; }
