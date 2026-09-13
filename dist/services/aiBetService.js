"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBetOfDay = generateBetOfDay;
const Match_1 = require("../models/Match");
const BetOfDay_1 = require("../models/BetOfDay");
const env_1 = require("../config/env");
async function openAISelect(candidates) {
    const key = env_1.env.OPENAI_API_KEY;
    if (!key)
        return null;
    const model = env_1.env.OPENAI_MODEL;
    const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, input: [{ role: 'system', content: 'Select exactly 2 upcoming football matches for an admin Bet of the Day. Do not call anything guaranteed or safe. Prefer conservative markets such as double chance or under/over when supported. Return strict JSON array with matchId, prediction, confidence, risk, analysis.' }, { role: 'user', content: JSON.stringify(candidates) }], text: { format: { type: 'json_schema', name: 'bet_of_day', schema: { type: 'object', properties: { picks: { type: 'array', items: { type: 'object', properties: { matchId: { type: 'string' }, prediction: { type: 'string' }, confidence: { type: 'number' }, risk: { type: 'string' }, analysis: { type: 'string' } }, required: ['matchId', 'prediction', 'confidence', 'risk', 'analysis'], additionalProperties: false }, minItems: 2, maxItems: 2 } }, required: ['picks'], additionalProperties: false }, strict: true } } }) });
    if (!response.ok)
        throw new Error(`AI request failed: ${response.status}`);
    const body = await response.json();
    const text = body.output?.flatMap((x) => x.content || []).find((x) => x.type === 'output_text')?.text;
    return text ? JSON.parse(text).picks : null;
}
async function generateBetOfDay(date = new Date().toISOString().slice(0, 10)) {
    const from = new Date(`${date}T00:00:00.000Z`), to = new Date(`${date}T23:59:59.999Z`);
    const matches = await Match_1.Match.find({ kickoff: { $gte: from, $lte: to }, status: 'scheduled' }).sort({ kickoff: 1 }).limit(40).populate('homeTeamId', 'name').populate('awayTeamId', 'name').populate('leagueId', 'name');
    if (matches.length < 2)
        throw new Error('At least two upcoming matches are required');
    const candidates = matches.map((m) => ({ matchId: String(m._id), fixture: `${m.homeTeamId?.name || 'Home'} vs ${m.awayTeamId?.name || 'Away'}`, league: m.leagueId?.name || '', kickoff: m.kickoff }));
    let picks = null, model = 'heuristic';
    try {
        picks = await openAISelect(candidates);
        if (picks?.length)
            model = process.env.OPENAI_MODEL || 'gpt-5.6-luna';
    }
    catch (e) {
        console.warn('Bet of Day AI fallback:', e);
    }
    if (!picks) {
        picks = matches.slice(0, 2).map((m, i) => ({ matchId: String(m._id), prediction: 'Double Chance', confidence: Math.max(55, 68 - i * 4), risk: 'low', analysis: 'System fallback selection based on scheduled fixture availability; this is not a guarantee.' }));
    }
    await BetOfDay_1.BetOfDay.deleteMany({ date, status: { $in: ['draft', 'approved'] } });
    const docs = [];
    for (const p of picks.slice(0, 2)) {
        if (!matches.some(m => String(m._id) === String(p.matchId)))
            continue;
        docs.push(await BetOfDay_1.BetOfDay.findOneAndUpdate({ date, matchId: p.matchId }, { $set: { prediction: p.prediction, confidence: p.confidence, risk: p.risk, analysis: p.analysis, model, status: 'draft' } }, { upsert: true, new: true, setDefaultsOnInsert: true }));
    }
    return docs;
}
