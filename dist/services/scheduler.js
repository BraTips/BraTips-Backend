"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.runSync = runSync;
const providerService_1 = require("./providerService");
const SyncJob_1 = require("../models/SyncJob");
const aiBetService_1 = require("./aiBetService");
async function runSync(type, date) {
    const job = await SyncJob_1.SyncJob.create({ type, status: 'running', startedAt: new Date(), date });
    try {
        const p = type === 'live' ? await (0, providerService_1.fetchLiveFootball)() : await (0, providerService_1.fetchFixtures)(date);
        const fixtures = Array.isArray(p?.data) ? p.data : [];
        const upserted = await (0, providerService_1.syncFixtures)(fixtures);
        job.status = 'success';
        job.fetched = fixtures.length;
        job.upserted = upserted;
        job.finishedAt = new Date();
        await job.save();
        return job;
    }
    catch (e) {
        job.status = 'failed';
        job.error = e?.message || String(e);
        job.finishedAt = new Date();
        await job.save();
        throw e;
    }
}
function msUntilNext(hour, minute) { const now = new Date(); const next = new Date(now); next.setHours(hour, minute, 0, 0); if (next <= now)
    next.setDate(next.getDate() + 1); return next.getTime() - now.getTime(); }
function startScheduler() {
    const scheduleDaily = () => { setTimeout(async () => { const date = new Date().toISOString().slice(0, 10); try {
        await runSync('daily', date);
        await (0, aiBetService_1.generateBetOfDay)(date);
    }
    catch (e) {
        console.error('Daily scheduler failed', e);
    }
    finally {
        scheduleDaily();
    } }, msUntilNext(2, 0)); };
    scheduleDaily();
    const live = async () => { try {
        await runSync('live');
    }
    catch (e) {
        console.error('Live sync failed', e);
    }
    finally {
        setTimeout(live, 5 * 60 * 1000);
    } };
    setTimeout(live, 60 * 1000);
}
