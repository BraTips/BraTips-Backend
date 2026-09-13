"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.integrationsRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const providers_1 = require("../config/providers");
const Match_1 = require("../models/Match");
const providerService_1 = require("../services/providerService");
exports.integrationsRouter = (0, express_1.Router)();
exports.integrationsRouter.use(auth_1.requireAuth, (0, auth_1.requireRole)('admin'));
exports.integrationsRouter.get('/config', (_req, res) => {
    res.json({ data: { providers: (0, providers_1.providerStatuses)(), note: 'Secrets are read from backend environment variables and are never returned to the browser.' } });
});
exports.integrationsRouter.get('/health', async (_req, res) => {
    const providers = (0, providers_1.providerStatuses)();
    res.json({ data: { providers, database: 'connected', matchData: { total: await Match_1.Match.countDocuments(), live: await Match_1.Match.countDocuments({ status: 'live' }) } } });
});
exports.integrationsRouter.post('/sync', async (_req, res, next) => {
    try {
        const payload = await (0, providerService_1.fetchLiveFootball)();
        const fixtures = Array.isArray(payload?.data) ? payload.data : [];
        const upserted = await (0, providerService_1.syncFixtures)(fixtures);
        res.status(200).json({ data: { accepted: true, fetched: fixtures.length, upserted, message: 'Sportmonks live fixtures synchronized.' } });
    }
    catch (e) {
        next(e);
    }
});
