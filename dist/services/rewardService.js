"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settlePredictionRewards = settlePredictionRewards;
exports.settleAllRewards = settleAllRewards;
const Prediction_1 = require("../models/Prediction");
const TipsterProfile_1 = require("../models/TipsterProfile");
const RewardRule_1 = require("../models/RewardRule");
const RewardLedger_1 = require("../models/RewardLedger");
async function settlePredictionRewards(predictionId) {
    const prediction = await Prediction_1.Prediction.findById(predictionId);
    if (!prediction || !['won', 'lost', 'void'].includes(prediction.status))
        return null;
    const profile = await TipsterProfile_1.TipsterProfile.findOne({ userId: prediction.tipsterId });
    if (!profile)
        return null;
    const settled = await Prediction_1.Prediction.find({ tipsterId: prediction.tipsterId, status: { $in: ['won', 'lost', 'void'] }, resultAt: { $ne: null } }).sort({ resultAt: 1, createdAt: 1 });
    let streak = 0, longest = 0;
    for (const p of settled) {
        if (p.status === 'won')
            streak += 1;
        else
            streak = 0;
        longest = Math.max(longest, streak);
        await Prediction_1.Prediction.updateOne({ _id: p._id }, { $set: { currentStreak: streak } });
    }
    profile.currentStreak = streak;
    profile.longestStreak = Math.max(profile.longestStreak || 0, longest);
    profile.totalTips = settled.length;
    profile.wins = settled.filter(p => p.status === 'won').length;
    profile.losses = settled.filter(p => p.status === 'lost').length;
    profile.profit = settled.reduce((sum, p) => sum + (Number(p.profit) || 0), 0);
    profile.roi = profile.totalTips ? Number(((profile.profit / profile.totalTips) * 100).toFixed(2)) : 0;
    let rewardCount = 0;
    if (prediction.status === 'won') {
        const rules = await RewardRule_1.RewardRule.find({ active: true, streak: { $lte: streak } }).sort({ streak: -1 });
        for (const rule of rules) {
            const r = await RewardLedger_1.RewardLedger.updateOne({ predictionId: prediction._id, ruleId: rule._id }, { $setOnInsert: { tipsterId: profile._id, predictionId: prediction._id, ruleId: rule._id, streak, amount: rule.amount, currency: rule.currency, status: 'pending' } }, { upsert: true });
            rewardCount += r.upsertedCount;
        }
    }
    const earned = await RewardLedger_1.RewardLedger.aggregate([{ $match: { tipsterId: profile._id, status: { $in: ['pending', 'approved', 'paid'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const paid = await RewardLedger_1.RewardLedger.aggregate([{ $match: { tipsterId: profile._id, status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    profile.totalRewardsEarned = earned[0]?.total || 0;
    profile.totalRewardsPaid = paid[0]?.total || 0;
    await profile.save();
    return { streak, longestStreak: profile.longestStreak, rewardsCreated: rewardCount };
}
async function settleAllRewards() {
    const ids = await Prediction_1.Prediction.find({ status: { $in: ['won', 'lost', 'void'] }, resultAt: { $ne: null } }).distinct('_id');
    for (const id of ids)
        await settlePredictionRewards(String(id));
}
