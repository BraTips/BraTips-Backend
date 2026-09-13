"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsRouter = void 0;
const express_1 = require("express");
const User_1 = require("../models/User");
const Match_1 = require("../models/Match");
const Prediction_1 = require("../models/Prediction");
const TipsterApplication_1 = require("../models/TipsterApplication");
const TipsterProfile_1 = require("../models/TipsterProfile");
const League_1 = require("../models/League");
const auth_1 = require("../middleware/auth");
exports.analyticsRouter = (0, express_1.Router)();
exports.analyticsRouter.use(auth_1.requireAuth, (0, auth_1.requireRole)('admin'));
function daysBack(raw) {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n || 30), 7), 365) : 30;
}
exports.analyticsRouter.get('/overview', async (req, res, next) => {
    try {
        const days = daysBack(req.query.days);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - days + 1);
        const [users, matches, predictions, applications, tipsters, leagues, statusCounts, predictionStatus, topTipsters] = await Promise.all([
            User_1.User.countDocuments(), Match_1.Match.countDocuments(), Prediction_1.Prediction.countDocuments(),
            TipsterApplication_1.TipsterApplication.countDocuments(), TipsterProfile_1.TipsterProfile.countDocuments({ active: true }), League_1.League.countDocuments(),
            Match_1.Match.aggregate([{ $match: { kickoff: { $gte: start } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
            Prediction_1.Prediction.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, profit: { $sum: { $ifNull: ['$profit', 0] } } } }]),
            TipsterProfile_1.TipsterProfile.find({ active: true }).sort({ profit: -1 }).limit(10).select('username totalTips wins losses profit roi')
        ]);
        const userSeries = await User_1.User.aggregate([
            { $match: { createdAt: { $gte: start } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        const predictionSeries = await Prediction_1.Prediction.aggregate([
            { $match: { createdAt: { $gte: start } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, profit: { $sum: { $ifNull: ['$profit', 0] } } } },
            { $sort: { _id: 1 } }
        ]);
        res.json({ data: { rangeDays: days, totals: { users, matches, predictions, applications, tipsters, leagues }, matchStatuses: statusCounts, predictionStatuses: predictionStatus, userSeries, predictionSeries, topTipsters } });
    }
    catch (e) {
        next(e);
    }
});
