import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import { providerStatuses } from '../config/providers';
import { Match } from '../models/Match';
import { fetchLiveFootball, fetchFixtures, syncFixtures } from '../services/providerService';

export const integrationsRouter = Router();
integrationsRouter.use(requireAuth, requireRole('admin'));

integrationsRouter.get('/config', (_req, res) => {
  res.json({ data: { providers: providerStatuses(), note: 'Secrets are read from backend environment variables and are never returned to the browser.' } });
});

integrationsRouter.get('/health', async (_req, res) => {
  const providers = providerStatuses();
  res.json({ data: { providers, database: 'connected', matchData: { total: await Match.countDocuments(), live: await Match.countDocuments({ status: 'live' }) } } });
});

integrationsRouter.post('/sync', async (_req, res, next) => {
  try {
    const payload: any = await fetchLiveFootball();
    const fixtures = Array.isArray(payload?.data) ? payload.data : [];
    const upserted = await syncFixtures(fixtures);
    res.status(200).json({ data: { accepted: true, fetched: fixtures.length, upserted, message: 'Sportmonks live fixtures synchronized.' } });
  } catch (e) { next(e); }
});
