import { Router } from 'express';
import { User } from '../models/User';
import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { TipsterApplication } from '../models/TipsterApplication';
import { TipsterProfile } from '../models/TipsterProfile';
import { League } from '../models/League';
import { requireAuth, requireRole } from '../middleware/auth';

export const analyticsRouter = Router();
analyticsRouter.use(requireAuth, requireRole('admin'));

function daysBack(raw: unknown) {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(Math.max(Math.floor(n || 30), 7), 365) : 30;
}

analyticsRouter.get('/overview', async (req, res, next) => {
  try {
    const days = daysBack(req.query.days);
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days + 1);
    const [users, matches, predictions, applications, tipsters, leagues, statusCounts, predictionStatus, topTipsters] = await Promise.all([
      User.countDocuments(), Match.countDocuments(), Prediction.countDocuments(),
      TipsterApplication.countDocuments(), TipsterProfile.countDocuments({ active: true }), League.countDocuments(),
      Match.aggregate([{ $match: { kickoff: { $gte: start } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Prediction.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, profit: { $sum: { $ifNull: ['$profit', 0] } } } }]),
      TipsterProfile.find({ active: true }).sort({ profit: -1 }).limit(10).select('username totalTips wins losses profit roi')
    ]);
    const userSeries = await User.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const predictionSeries = await Prediction.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 }, profit: { $sum: { $ifNull: ['$profit', 0] } } } },
      { $sort: { _id: 1 } }
    ]);
    res.json({ data: { rangeDays: days, totals: { users, matches, predictions, applications, tipsters, leagues }, matchStatuses: statusCounts, predictionStatuses: predictionStatus, userSeries, predictionSeries, topTipsters } });
  } catch (e) { next(e); }
});
