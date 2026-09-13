"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const User_1 = require("../models/User");
const League_1 = require("../models/League");
const Season_1 = require("../models/Season");
const Team_1 = require("../models/Team");
const Match_1 = require("../models/Match");
const TipsterApplication_1 = require("../models/TipsterApplication");
const TipsterProfile_1 = require("../models/TipsterProfile");
const Prediction_1 = require("../models/Prediction");
const auth_1 = require("../middleware/auth");
exports.adminRouter = (0, express_1.Router)();
exports.adminRouter.use(auth_1.requireAuth, (0, auth_1.requireRole)("admin"));
const id = zod_1.z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB id");
const leagueBody = zod_1.z.object({ externalId: zod_1.z.string().optional(), name: zod_1.z.string().min(1).max(120), country: zod_1.z.string().min(1).max(100), logo: zod_1.z.string().url().optional().or(zod_1.z.literal("")), active: zod_1.z.boolean().optional() });
const seasonBody = zod_1.z.object({ leagueId: id, externalId: zod_1.z.string().optional(), name: zod_1.z.string().min(1).max(100), startDate: zod_1.z.coerce.date().optional(), endDate: zod_1.z.coerce.date().optional(), active: zod_1.z.boolean().optional() });
const teamBody = zod_1.z.object({ externalId: zod_1.z.string().optional(), name: zod_1.z.string().min(1).max(120), shortName: zod_1.z.string().max(50).optional(), country: zod_1.z.string().max(100).optional(), logo: zod_1.z.string().url().optional().or(zod_1.z.literal("")), active: zod_1.z.boolean().optional() });
const matchBody = zod_1.z.object({ externalId: zod_1.z.string().optional(), leagueId: id, seasonId: id.optional(), homeTeamId: id, awayTeamId: id, kickoff: zod_1.z.coerce.date(), status: zod_1.z.enum(["scheduled", "live", "finished", "postponed", "cancelled"]).optional(), homeScore: zod_1.z.number().int().min(0).optional(), awayScore: zod_1.z.number().int().min(0).optional(), venue: zod_1.z.object({ name: zod_1.z.string().max(150).optional(), city: zod_1.z.string().max(100).optional() }).optional() });
const predictionBody = zod_1.z.object({ tipsterId: id, matchId: id.optional().or(zod_1.z.literal("")), fixture: zod_1.z.string().min(1).max(200), league: zod_1.z.string().max(120).optional().or(zod_1.z.literal("")), prediction: zod_1.z.string().min(1).max(200), odds: zod_1.z.coerce.number().min(1), confidence: zod_1.z.coerce.number().min(0).max(100).optional().or(zod_1.z.literal("")), analysis: zod_1.z.string().max(3000).optional().or(zod_1.z.literal("")), status: zod_1.z.enum(["pending", "published", "won", "lost", "void"]).optional(), profit: zod_1.z.coerce.number().optional().or(zod_1.z.literal("")) });
async function crud(model, body, req, res, next) { try {
    if (req.method === "GET") {
        const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100), search = typeof req.query.search === "string" ? req.query.search.trim() : "";
        const filter = search ? { name: { $regex: search, $options: "i" } } : {};
        const [data, total] = await Promise.all([model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), model.countDocuments(filter)]);
        return res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    }
    const parsed = body.parse(req.body);
    if (req.method === "POST")
        return res.status(201).json({ data: await model.create(parsed) });
    const found = await model.findById(req.params.id);
    if (!found)
        return res.status(404).json({ message: "Record not found" });
    if (req.method === "PATCH") {
        Object.assign(found, parsed);
        await found.save();
        return res.json({ data: found });
    }
    if (req.method === "DELETE") {
        await model.findByIdAndDelete(req.params.id);
        return res.json({ ok: true });
    }
}
catch (e) {
    next(e);
} }
for (const [path, model, body] of [["leagues", League_1.League, leagueBody], ["seasons", Season_1.Season, seasonBody], ["teams", Team_1.Team, teamBody], ["matches", Match_1.Match, matchBody]]) {
    exports.adminRouter.get(`/${path}`, (req, res, next) => crud(model, body, req, res, next));
    exports.adminRouter.post(`/${path}`, (req, res, next) => crud(model, body, req, res, next));
    exports.adminRouter.patch(`/${path}/:id`, (req, res, next) => crud(model, body, req, res, next));
    exports.adminRouter.delete(`/${path}/:id`, (req, res, next) => crud(model, body, req, res, next));
}
exports.adminRouter.get("/dashboard", async (_req, res, next) => { try {
    const [users, leagues, seasons, teams, matches, live, finished, tipsterPending, tipsters, predictions, approved, rejected] = await Promise.all([User_1.User.countDocuments(), League_1.League.countDocuments(), Season_1.Season.countDocuments(), Team_1.Team.countDocuments(), Match_1.Match.countDocuments(), Match_1.Match.countDocuments({ status: "live" }), Match_1.Match.countDocuments({ status: "finished" }), TipsterApplication_1.TipsterApplication.countDocuments({ status: { $in: ["pending", "under_review", "more_info"] } }), TipsterProfile_1.TipsterProfile.countDocuments({ active: true }), Prediction_1.Prediction.countDocuments(), Prediction_1.Prediction.countDocuments({ status: "won" }), Prediction_1.Prediction.countDocuments({ status: "lost" })]);
    const totalSettled = approved + rejected;
    res.json({ data: { users, leagues, seasons, teams, matches, live, finished, tipsterPending, tipsters, predictions, approvedPredictions: approved, lostPredictions: rejected, winRate: totalSettled ? Math.round(approved / totalSettled * 1000) / 10 : 0 } });
}
catch (e) {
    next(e);
} });
exports.adminRouter.get("/users", async (req, res) => { const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Math.max(Number(req.query.limit) || 25, 1), 100), search = typeof req.query.search === "string" ? req.query.search.trim() : "", role = typeof req.query.role === "string" ? req.query.role : undefined; const filter = search ? { $or: [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }] } : {}; if (role)
    filter.role = role; const [data, total] = await Promise.all([User_1.User.find(filter).select("-passwordHash").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit), User_1.User.countDocuments(filter)]); res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } }); });
exports.adminRouter.patch("/users/:id", async (req, res) => { const body = zod_1.z.object({ name: zod_1.z.string().min(2).max(100).optional(), role: zod_1.z.enum(["user", "admin", "tipster"]).optional(), status: zod_1.z.enum(["active", "suspended"]).optional() }).parse(req.body); const user = await User_1.User.findByIdAndUpdate(req.params.id, { $set: body }, { new: true }).select("-passwordHash"); if (!user)
    return res.status(404).json({ message: "User not found" }); res.json({ data: user }); });
exports.adminRouter.get("/tipster-applications", async (req, res, next) => { try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const filter = {};
    if (status)
        filter.status = status;
    if (search)
        filter.$or = [{ username: { $regex: search, $options: "i" } }, { bio: { $regex: search, $options: "i" } }];
    const data = await TipsterApplication_1.TipsterApplication.find(filter).populate("userId", "name email").populate("reviewedBy", "name email").sort({ createdAt: -1 }).limit(200);
    res.json({ data });
}
catch (e) {
    next(e);
} });
exports.adminRouter.get("/tipster-applications/:id", async (req, res) => { const item = await TipsterApplication_1.TipsterApplication.findById(req.params.id).populate("userId", "name email"); if (!item)
    return res.status(404).json({ message: "Application not found" }); res.json({ data: item }); });
const reviewSchema = zod_1.z.object({ action: zod_1.z.enum(["under_review", "approve", "reject", "more_info", "suspend"]), adminNotes: zod_1.z.string().max(3000).optional() });
exports.adminRouter.patch("/tipster-applications/:id/review", async (req, res) => {
    const { action, adminNotes } = reviewSchema.parse(req.body);
    const application = await TipsterApplication_1.TipsterApplication.findById(req.params.id);
    if (!application)
        return res.status(404).json({ message: "Application not found" });
    const auth = req;
    const now = new Date();
    const map = { under_review: "under_review", reject: "rejected", more_info: "more_info", suspend: "suspended", approve: "approved" };
    application.status = map[action];
    application.adminNotes = adminNotes;
    application.reviewedBy = auth.user.id;
    application.reviewedAt = now;
    await application.save();
    if (action === "approve") {
        const user = await User_1.User.findByIdAndUpdate(application.userId, { role: "tipster", status: "active" }, { new: true });
        if (!user)
            return res.status(404).json({ message: "Applicant user not found" });
        await TipsterProfile_1.TipsterProfile.findOneAndUpdate({ userId: user._id }, { userId: user._id, applicationId: application._id, username: application.username, bio: application.bio, country: application.country, expertise: application.expertise, profilePhoto: application.profilePhoto, socialLinks: application.socialLinks, active: true }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    if (action === "suspend") {
        await User_1.User.findByIdAndUpdate(application.userId, { status: "suspended" });
        await TipsterProfile_1.TipsterProfile.findOneAndUpdate({ userId: application.userId }, { active: false });
    }
    res.json({ data: application });
});
exports.adminRouter.get("/tipsters", async (_req, res) => { const data = await TipsterProfile_1.TipsterProfile.find().populate("userId", "name email status").sort({ createdAt: -1 }); res.json({ data }); });
exports.adminRouter.get("/predictions", async (req, res) => { const status = typeof req.query.status === "string" ? req.query.status : undefined; const filter = status ? { status } : {}; const data = await Prediction_1.Prediction.find(filter).populate("tipsterId", "name email").populate("matchId").sort({ createdAt: -1 }).limit(200); res.json({ data }); });
function cleanPrediction(parsed) { const out = { ...parsed }; if (out.matchId === "")
    delete out.matchId; if (out.league === "")
    delete out.league; if (out.confidence === "")
    delete out.confidence; if (out.analysis === "")
    delete out.analysis; if (out.profit === "")
    delete out.profit; return out; }
exports.adminRouter.post("/predictions", async (req, res, next) => { try {
    const parsed = cleanPrediction(predictionBody.parse(req.body));
    const created = await Prediction_1.Prediction.create(parsed);
    res.status(201).json({ data: created });
}
catch (e) {
    next(e);
} });
exports.adminRouter.patch("/predictions/:id", async (req, res, next) => { try {
    const parsed = cleanPrediction(predictionBody.partial().parse(req.body));
    const found = await Prediction_1.Prediction.findById(req.params.id);
    if (!found)
        return res.status(404).json({ message: "Prediction not found" });
    Object.assign(found, parsed);
    if (parsed.status === "won" || parsed.status === "lost")
        found.resultAt = new Date();
    if (parsed.status === "published" && !found.publishedAt)
        found.publishedAt = new Date();
    await found.save();
    if (['won', 'lost', 'void'].includes(found.status))
        await (0, rewardService_1.settlePredictionRewards)(String(found._id));
    res.json({ data: found });
}
catch (e) {
    next(e);
} });
exports.adminRouter.delete("/predictions/:id", async (req, res) => { await Prediction_1.Prediction.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
// --- Admin automation, rewards, AI picks and historical performance ---
const SyncJob_1 = require("../models/SyncJob");
const RewardRule_1 = require("../models/RewardRule");
const RewardLedger_1 = require("../models/RewardLedger");
const BetOfDay_1 = require("../models/BetOfDay");
const rewardService_1 = require("../services/rewardService");
const aiBetService_1 = require("../services/aiBetService");
const scheduler_1 = require("../services/scheduler");
const rewardRuleBody = zod_1.z.object({ name: zod_1.z.string().min(1).max(120), streak: zod_1.z.coerce.number().int().min(1), amount: zod_1.z.coerce.number().min(0), currency: zod_1.z.string().min(1).max(10).default('GHS'), active: zod_1.z.boolean().optional() });
exports.adminRouter.get('/rewards/rules', async (_req, res, next) => { try {
    res.json({ data: await RewardRule_1.RewardRule.find().sort({ streak: 1 }) });
}
catch (e) {
    next(e);
} });
exports.adminRouter.post('/rewards/rules', async (req, res, next) => { try {
    res.status(201).json({ data: await RewardRule_1.RewardRule.create(rewardRuleBody.parse(req.body)) });
}
catch (e) {
    next(e);
} });
exports.adminRouter.patch('/rewards/rules/:id', async (req, res, next) => { try {
    const item = await RewardRule_1.RewardRule.findByIdAndUpdate(req.params.id, rewardRuleBody.partial().parse(req.body), { new: true });
    if (!item)
        return res.status(404).json({ message: 'Reward rule not found' });
    res.json({ data: item });
}
catch (e) {
    next(e);
} });
exports.adminRouter.delete('/rewards/rules/:id', async (req, res, next) => { try {
    await RewardRule_1.RewardRule.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/rewards/ledger', async (req, res, next) => { try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const filter = status ? { status } : {};
    const data = await RewardLedger_1.RewardLedger.find(filter).populate({ path: 'tipsterId', populate: { path: 'userId', select: 'name email' } }).populate('predictionId', 'fixture prediction status resultAt').populate('ruleId', 'name streak amount currency').sort({ createdAt: -1 }).limit(500);
    const totals = await RewardLedger_1.RewardLedger.aggregate([{ $match: filter }, { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]);
    res.json({ data, totals });
}
catch (e) {
    next(e);
} });
const rewardStatusBody = zod_1.z.object({ status: zod_1.z.enum(['pending', 'approved', 'paid', 'cancelled']), note: zod_1.z.string().max(500).optional() });
exports.adminRouter.patch('/rewards/ledger/:id', async (req, res, next) => { try {
    const item = await RewardLedger_1.RewardLedger.findById(req.params.id);
    if (!item)
        return res.status(404).json({ message: 'Reward not found' });
    const b = rewardStatusBody.parse(req.body);
    item.status = b.status;
    item.note = b.note;
    if (b.status === 'approved')
        item.approvedAt = new Date();
    if (b.status === 'paid')
        item.paidAt = new Date();
    await item.save();
    const p = await TipsterProfile_1.TipsterProfile.findById(item.tipsterId);
    if (p) {
        p.totalRewardsPaid = await RewardLedger_1.RewardLedger.aggregate([{ $match: { tipsterId: p._id, status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).then(x => x[0]?.total || 0);
        p.totalRewardsEarned = await RewardLedger_1.RewardLedger.aggregate([{ $match: { tipsterId: p._id, status: { $in: ['pending', 'approved', 'paid'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]).then(x => x[0]?.total || 0);
        await p.save();
    }
    res.json({ data: item });
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/rewards/summary', async (_req, res, next) => { try {
    const [pending, approved, paid] = await Promise.all(['pending', 'approved', 'paid'].map(status => RewardLedger_1.RewardLedger.aggregate([{ $match: { status } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }])));
    res.json({ data: { pending: pending[0] || { amount: 0, count: 0 }, approved: approved[0] || { amount: 0, count: 0 }, paid: paid[0] || { amount: 0, count: 0 } } });
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/sync/status', async (_req, res, next) => { try {
    const [latest, history] = await Promise.all([SyncJob_1.SyncJob.findOne().sort({ startedAt: -1 }), SyncJob_1.SyncJob.find().sort({ startedAt: -1 }).limit(30)]);
    res.json({ data: { latest, history } });
}
catch (e) {
    next(e);
} });
exports.adminRouter.post('/sync/run', async (req, res, next) => { try {
    const type = req.body?.type === 'live' ? 'live' : 'daily';
    const date = typeof req.body?.date === 'string' ? req.body.date : new Date().toISOString().slice(0, 10);
    const job = await (0, scheduler_1.runSync)(type, date);
    res.json({ data: job });
}
catch (e) {
    next(e);
} });
exports.adminRouter.post('/sync/run-daily', async (req, res, next) => { try {
    const date = typeof req.body?.date === 'string' ? req.body.date : new Date().toISOString().slice(0, 10);
    const job = await (0, scheduler_1.runSync)('daily', date);
    const picks = await (0, aiBetService_1.generateBetOfDay)(date).catch(() => []);
    res.json({ data: { job, picks } });
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/prediction-history', async (req, res, next) => { try {
    const page = Math.max(Number(req.query.page) || 1, 1), limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const tipsterId = typeof req.query.tipsterId === 'string' ? req.query.tipsterId : undefined;
    const filter = { status: { $in: ['won', 'lost', 'void'] } };
    if (status)
        filter.status = status;
    if (tipsterId)
        filter.tipsterId = tipsterId;
    const [data, total, stats] = await Promise.all([Prediction_1.Prediction.find(filter).populate('tipsterId', 'name email').populate('matchId').sort({ resultAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit), Prediction_1.Prediction.countDocuments(filter), Prediction_1.Prediction.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: 1 }, wins: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } }, profit: { $sum: { $ifNull: ['$profit', 0] } } } }, { $project: { _id: 0, total: 1, wins: 1, losses: { $subtract: ['$total', '$wins'] }, profit: 1, winRate: { $cond: [{ $gt: ['$total', 0] }, { $multiply: [{ $divide: ['$wins', '$total'] }, 100] }, 0] } } }])]);
    res.json({ data, pagination: { page, limit, total, pages: Math.ceil(total / limit) }, stats: stats[0] || { total: 0, wins: 0, losses: 0, profit: 0, winRate: 0 } });
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/bet-of-day', async (req, res, next) => { try {
    const date = typeof req.query.date === 'string' ? req.query.date : new Date().toISOString().slice(0, 10);
    const data = await BetOfDay_1.BetOfDay.find({ date }).populate({ path: 'matchId', populate: [{ path: 'homeTeamId', select: 'name' }, { path: 'awayTeamId', select: 'name' }, { path: 'leagueId', select: 'name' }] }).sort({ createdAt: 1 });
    res.json({ data });
}
catch (e) {
    next(e);
} });
exports.adminRouter.post('/bet-of-day/generate', async (req, res, next) => { try {
    const date = typeof req.body?.date === 'string' ? req.body.date : new Date().toISOString().slice(0, 10);
    res.json({ data: await (0, aiBetService_1.generateBetOfDay)(date) });
}
catch (e) {
    next(e);
} });
const betStatus = zod_1.z.object({ status: zod_1.z.enum(['draft', 'approved', 'published', 'won', 'lost', 'void']), prediction: zod_1.z.string().min(1).optional(), confidence: zod_1.z.coerce.number().min(0).max(100).optional(), risk: zod_1.z.string().max(50).optional(), analysis: zod_1.z.string().max(3000).optional() });
exports.adminRouter.patch('/bet-of-day/:id', async (req, res, next) => { try {
    const item = await BetOfDay_1.BetOfDay.findByIdAndUpdate(req.params.id, betStatus.parse(req.body), { new: true });
    if (!item)
        return res.status(404).json({ message: 'Bet of the Day not found' });
    res.json({ data: item });
}
catch (e) {
    next(e);
} });
// Seed sensible defaults once, without overwriting admin changes.
RewardRule_1.RewardRule.countDocuments().then(async (count) => { if (count === 0)
    await RewardRule_1.RewardRule.insertMany([{ name: '3-win streak', streak: 3, amount: 50, currency: 'GHS', active: true }, { name: '5-win streak', streak: 5, amount: 150, currency: 'GHS', active: true }, { name: '10-win streak', streak: 10, amount: 500, currency: 'GHS', active: true }]); }).catch(() => undefined);
