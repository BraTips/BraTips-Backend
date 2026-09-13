"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const Prediction_1 = require("../models/Prediction");
const TipsterProfile_1 = require("../models/TipsterProfile");
const UserPick_1 = require("../models/UserPick");
exports.userRouter = (0, express_1.Router)();
exports.userRouter.use(auth_1.requireAuth);
exports.userRouter.get('/picks', async (req, res, next) => { try {
    const data = await UserPick_1.UserPick.find({ userId: req.user.id }).populate({ path: 'predictionId', populate: [{ path: 'tipsterId', select: 'name' }, { path: 'matchId' }] }).sort({ createdAt: -1 }).limit(200);
    res.json({ data });
}
catch (e) {
    next(e);
} });
exports.userRouter.post('/picks', async (req, res, next) => { try {
    const b = zod_1.z.object({ predictionId: zod_1.z.string().regex(/^[a-f\d]{24}$/i), stake: zod_1.z.coerce.number().positive().max(100000) }).parse(req.body);
    const p = await Prediction_1.Prediction.findOne({ _id: b.predictionId, status: 'published' });
    if (!p)
        return res.status(404).json({ message: 'Published prediction not found' });
    const existing = await UserPick_1.UserPick.findOne({ userId: req.user.id, predictionId: p._id, status: 'open' });
    if (existing)
        return res.status(409).json({ message: 'This pick is already in your list' });
    const item = await UserPick_1.UserPick.create({ userId: req.user.id, predictionId: p._id, stake: b.stake, potentialReturn: Math.round(b.stake * p.odds * 100) / 100 });
    res.status(201).json({ data: item });
}
catch (e) {
    next(e);
} });
exports.userRouter.delete('/picks/:id', async (req, res, next) => { try {
    const item = await UserPick_1.UserPick.findOneAndDelete({ _id: req.params.id, userId: req.user.id, status: 'open' });
    if (!item)
        return res.status(404).json({ message: 'Pick not found' });
    res.json({ ok: true });
}
catch (e) {
    next(e);
} });
exports.userRouter.get('/tipster', async (req, res, next) => { try {
    if (req.user.role !== 'tipster')
        return res.status(403).json({ message: 'Tipster account required' });
    const profile = await TipsterProfile_1.TipsterProfile.findOne({ userId: req.user.id });
    const predictions = await Prediction_1.Prediction.find({ tipsterId: req.user.id }).sort({ createdAt: -1 }).limit(100);
    res.json({ data: { profile, predictions } });
}
catch (e) {
    next(e);
} });
exports.userRouter.post('/tipster/predictions', (0, auth_1.requireRole)('tipster'), async (req, res, next) => { try {
    const b = zod_1.z.object({ matchId: zod_1.z.string().regex(/^[a-f\d]{24}$/i).optional(), fixture: zod_1.z.string().min(3).max(200), league: zod_1.z.string().max(120).optional(), prediction: zod_1.z.string().min(2).max(200), odds: zod_1.z.coerce.number().min(1), confidence: zod_1.z.coerce.number().min(0).max(100).optional(), analysis: zod_1.z.string().max(3000).optional() }).parse(req.body);
    const p = await Prediction_1.Prediction.create({ ...b, tipsterId: req.user.id, status: 'pending' });
    res.status(201).json({ data: p, message: 'Prediction submitted for admin review' });
}
catch (e) {
    next(e);
} });
