"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providersRouter = void 0;
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const providerService_1 = require("../services/providerService");
const Prediction_1 = require("../models/Prediction");
exports.providersRouter = (0, express_1.Router)();
exports.providersRouter.use(auth_1.requireAuth, (0, auth_1.requireRole)('admin'));
exports.providersRouter.get('/live-football', async (_req, res, next) => { try {
    res.json({ data: await (0, providerService_1.fetchLiveFootball)() });
}
catch (e) {
    next(e);
} });
exports.providersRouter.get('/fixtures', async (req, res, next) => { try {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    res.json({ data: await (0, providerService_1.fetchFixtures)(date) });
}
catch (e) {
    next(e);
} });
exports.providersRouter.get('/fixtures/:id', async (req, res, next) => { try {
    res.json({ data: await (0, providerService_1.fetchFixture)(req.params.id) });
}
catch (e) {
    next(e);
} });
exports.providersRouter.get('/odds', async (req, res, next) => { try {
    const mode = req.query.mode === 'inplay' ? 'inplay' : 'pre-match';
    res.json({ data: await (0, providerService_1.fetchOdds)(mode) });
}
catch (e) {
    next(e);
} });
exports.providersRouter.get('/odds/:mode/:fixtureId', async (req, res, next) => { try {
    const mode = req.params.mode === 'inplay' ? 'inplay' : 'pre-match';
    res.json({ data: await (0, providerService_1.fetchFixtureOdds)(req.params.fixtureId, mode) });
}
catch (e) {
    next(e);
} });
exports.providersRouter.get('/xgoals/:fixtureId', async (req, res, next) => { try {
    res.json({ data: await (0, providerService_1.fetchXGoals)(req.params.fixtureId) });
}
catch (e) {
    next(e);
} });
exports.providersRouter.post('/live-football/sync', async (_req, res, next) => { try {
    const p = await (0, providerService_1.fetchLiveFootball)();
    const fixtures = Array.isArray(p?.data) ? p.data : [];
    res.json({ data: { fetched: fixtures.length, upserted: await (0, providerService_1.syncFixtures)(fixtures) } });
}
catch (e) {
    next(e);
} });
exports.providersRouter.post('/sync-date', async (req, res, next) => { try {
    const date = typeof req.body?.date === 'string' ? req.body.date : new Date().toISOString().slice(0, 10);
    const p = await (0, providerService_1.fetchFixtures)(date);
    const fixtures = Array.isArray(p?.data) ? p.data : [];
    res.json({ data: { date, fetched: fixtures.length, upserted: await (0, providerService_1.syncFixtures)(fixtures) } });
}
catch (e) {
    next(e);
} });
exports.providersRouter.get('/trends', async (_req, res, next) => { try {
    const data = await Prediction_1.Prediction.aggregate([{ $match: { status: { $in: ['won', 'lost'] } } }, { $group: { _id: '$prediction', tips: { $sum: 1 }, wins: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } }, profit: { $sum: { $ifNull: ['$profit', 0] } } } }, { $addFields: { winRate: { $multiply: [{ $divide: ['$wins', '$tips'] }, 100] } } }, { $sort: { tips: -1 } }, { $limit: 25 }]);
    res.json({ data });
}
catch (e) {
    next(e);
} });
