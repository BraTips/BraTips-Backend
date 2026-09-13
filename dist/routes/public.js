"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicRouter = void 0;
const express_1 = require("express");
const League_1 = require("../models/League");
const Team_1 = require("../models/Team");
const Match_1 = require("../models/Match");
exports.publicRouter = (0, express_1.Router)();
exports.publicRouter.get("/leagues", async (_req, res) => res.json({ data: await League_1.League.find({ active: true }).sort({ name: 1 }) }));
exports.publicRouter.get("/leagues/:id", async (req, res) => { const x = await League_1.League.findById(req.params.id); if (!x)
    return res.status(404).json({ message: "League not found" }); res.json({ data: x }); });
exports.publicRouter.get("/teams", async (_req, res) => res.json({ data: await Team_1.Team.find({ active: true }).sort({ name: 1 }) }));
exports.publicRouter.get("/teams/:id", async (req, res) => { const x = await Team_1.Team.findById(req.params.id); if (!x)
    return res.status(404).json({ message: "Team not found" }); res.json({ data: x }); });
exports.publicRouter.get("/matches", async (req, res) => {
    const filter = {};
    if (typeof req.query.status === "string")
        filter.status = req.query.status;
    if (typeof req.query.leagueId === "string")
        filter.leagueId = req.query.leagueId;
    const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const [data, total] = await Promise.all([
        Match_1.Match.find(filter).populate("leagueId", "name country logo").populate("homeTeamId", "name shortName logo").populate("awayTeamId", "name shortName logo").sort({ kickoff: 1 }).skip((page - 1) * limit).limit(limit),
        Match_1.Match.countDocuments(filter)
    ]);
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
exports.publicRouter.get("/matches/today", async (_req, res) => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    res.json({ data: await Match_1.Match.find({ kickoff: { $gte: start, $lt: end } }).populate("leagueId", "name country").populate("homeTeamId", "name logo").populate("awayTeamId", "name logo").sort({ kickoff: 1 }) });
});
exports.publicRouter.get("/matches/live", async (_req, res) => res.json({ data: await Match_1.Match.find({ status: "live" }).populate("leagueId", "name").populate("homeTeamId", "name logo").populate("awayTeamId", "name logo").sort({ kickoff: 1 }) }));
exports.publicRouter.get("/matches/:id", async (req, res) => { const x = await Match_1.Match.findById(req.params.id).populate("leagueId", "name country logo").populate("homeTeamId", "name shortName logo").populate("awayTeamId", "name shortName logo"); if (!x)
    return res.status(404).json({ message: "Match not found" }); res.json({ data: x }); });
const Prediction_1 = require("../models/Prediction");
const TipsterProfile_1 = require("../models/TipsterProfile");
const BetOfDay_1 = require("../models/BetOfDay");
exports.publicRouter.get("/tipsters", async (_req, res, next) => { try {
    const data = await TipsterProfile_1.TipsterProfile.find({ active: true }).sort({ wins: -1, roi: -1 }).limit(100).select("username bio country expertise profilePhoto totalTips wins losses profit roi currentStreak longestStreak totalRewardsPaid");
    res.json({ data });
}
catch (e) {
    next(e);
} });
exports.publicRouter.get("/tipsters/:username", async (req, res, next) => { try {
    const profile = await TipsterProfile_1.TipsterProfile.findOne({ username: req.params.username, active: true }).select("username bio country expertise profilePhoto totalTips wins losses profit roi currentStreak longestStreak");
    if (!profile)
        return res.status(404).json({ message: "Tipster not found" });
    const predictions = await Prediction_1.Prediction.find({ tipsterId: profile.userId, status: { $in: ["published", "won", "lost", "void"] } }).populate("matchId").sort({ publishedAt: -1, createdAt: -1 }).limit(100);
    res.json({ data: { profile, predictions } });
}
catch (e) {
    next(e);
} });
exports.publicRouter.get("/predictions", async (req, res, next) => { try {
    const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const filter = { status: { $in: ["published", "won", "lost", "void"] } };
    if (search)
        filter.$or = [{ fixture: { $regex: search, $options: 'i' } }, { league: { $regex: search, $options: 'i' } }, { prediction: { $regex: search, $options: 'i' } }];
    const [data, total] = await Promise.all([Prediction_1.Prediction.find(filter).populate('tipsterId', 'name').populate({ path: 'matchId', populate: [{ path: 'homeTeamId', select: 'name' }, { path: 'awayTeamId', select: 'name' }, { path: 'leagueId', select: 'name' }] }).sort({ publishedAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit), Prediction_1.Prediction.countDocuments(filter)]);
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}
catch (e) {
    next(e);
} });
exports.publicRouter.get("/predictions/:id", async (req, res, next) => { try {
    const item = await Prediction_1.Prediction.findOne({ _id: req.params.id, status: { $in: ["published", "won", "lost", "void"] } }).populate('tipsterId', 'name').populate('matchId');
    if (!item)
        return res.status(404).json({ message: 'Prediction not found' });
    res.json({ data: item });
}
catch (e) {
    next(e);
} });
exports.publicRouter.get("/prediction-history", async (req, res, next) => { try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const filter = { status: { $in: ["won", "lost", "void"] } };
    const [data, stats] = await Promise.all([Prediction_1.Prediction.find(filter).populate('tipsterId', 'name').sort({ resultAt: -1, createdAt: -1 }).limit(limit), Prediction_1.Prediction.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: 1 }, wins: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } }, profit: { $sum: { $ifNull: ['$profit', 0] } } } }, { $project: { _id: 0, total: 1, wins: 1, profit: 1, winRate: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$wins', '$total'] }, 100] }, 0] } } }])]);
    res.json({ data, stats: stats[0] || { total: 0, wins: 0, profit: 0, winRate: 0 } });
}
catch (e) {
    next(e);
} });
exports.publicRouter.get("/bet-of-day", async (req, res, next) => { try {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const data = await BetOfDay_1.BetOfDay.find({ date, status: { $in: ["published", "won", "lost", "void"] } }).populate({ path: 'matchId', populate: [{ path: 'homeTeamId', select: 'name' }, { path: 'awayTeamId', select: 'name' }, { path: 'leagueId', select: 'name' }] }).sort({ createdAt: 1 });
    res.json({ data });
}
catch (e) {
    next(e);
} });
