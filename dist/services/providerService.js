"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchLiveFootball = fetchLiveFootball;
exports.fetchFixtures = fetchFixtures;
exports.fetchFixture = fetchFixture;
exports.fetchOdds = fetchOdds;
exports.fetchFixtureOdds = fetchFixtureOdds;
exports.fetchXGoals = fetchXGoals;
exports.syncFixtures = syncFixtures;
const providers_1 = require("../config/providers");
async function requestJson(url) {
    const c = (0, providers_1.providerConfig)().sportmonks;
    if (!c.apiKey) {
        throw new Error("Sportmonks API key is missing. Please set FOOTBALL_API_KEY in .env");
    }
    const separator = url.includes("?") ? "&" : "?";
    const requestUrl = `${url}${separator}api_token=${encodeURIComponent(c.apiKey)}`;
    const r = await fetch(requestUrl, {
        headers: {
            Accept: "application/json",
        },
        signal: AbortSignal.timeout(20000),
    });
    const body = await r.json();
    if (!r.ok) {
        throw new Error(body?.message ||
            body?.error ||
            `Sportmonks request failed with HTTP ${r.status}`);
    }
    return body;
}
function requireToken() { const c = (0, providers_1.providerConfig)().sportmonks; if (!c.apiKey)
    throw new Error('Sportmonks is not configured. Set FOOTBALL_API_KEY in bratips-backend/.env.'); return c; }
function url(path, params = {}) { const c = requireToken(); const u = new URL(`${c.baseUrl}${path}`); Object.entries(params).forEach(([k, v]) => v !== undefined && u.searchParams.set(k, v)); return u.toString(); }
async function fetchLiveFootball() {
    requireToken();
    return requestJson(url('/livescores/inplay', { include: 'participants;scores;events.type;periods;league;venue' }));
}
async function fetchFixtures(date) {
    requireToken();
    return requestJson(url(`/fixtures/date/${encodeURIComponent(date)}`, { include: 'participants;scores;events.type;lineups.player;statistics.type;xgfixture.type;predictions.type;league;venue' }));
}
async function fetchFixture(fixtureId) {
    requireToken();
    return requestJson(url(`/fixtures/${encodeURIComponent(fixtureId)}`, { include: 'participants;scores;events.type;lineups.player;statistics.type;xgfixture.type;predictions.type;league;venue' }));
}
async function fetchOdds(mode = 'pre-match') {
    requireToken();
    return requestJson(url(`/odds/${mode}`, { include: 'market;bookmaker;fixture' }));
}
async function fetchFixtureOdds(fixtureId, mode = 'pre-match') {
    requireToken();
    return requestJson(url(`/odds/${mode}/fixtures/${encodeURIComponent(fixtureId)}`, { include: 'market;bookmaker;fixture' }));
}
async function fetchXGoals(fixtureId) {
    requireToken();
    return requestJson(url(`/fixtures/${encodeURIComponent(fixtureId)}`, { include: 'xgfixture.type;lineups.xGLineup.type;participants;scores' }));
}
async function syncFixtures(fixtures) {
    const { League } = await Promise.resolve().then(() => __importStar(require('../models/League')));
    const { Team } = await Promise.resolve().then(() => __importStar(require('../models/Team')));
    const { Match } = await Promise.resolve().then(() => __importStar(require('../models/Match')));
    const { Season } = await Promise.resolve().then(() => __importStar(require('../models/Season')));
    let upserted = 0;
    for (const f of fixtures) {
        const participants = Array.isArray(f.participants) ? f.participants : [];
        const home = participants.find((p) => p.meta?.location === 'home') || participants[0];
        const away = participants.find((p) => p.meta?.location === 'away') || participants[1];
        const league = await League.findOneAndUpdate({ externalId: String(f.league_id ?? f.league?.id ?? '') }, { externalId: String(f.league_id ?? f.league?.id ?? ''), name: f.league?.name || `League ${f.league_id}`, country: f.league?.country?.name || f.league?.country || 'Unknown', logo: f.league?.image_path || '', active: true }, { upsert: true, new: true, setDefaultsOnInsert: true });
        const seasonExternalId = f.season_id ?? f.season?.id;
        const season = seasonExternalId ? await Season.findOneAndUpdate({ leagueId: league._id, externalId: String(seasonExternalId) }, { leagueId: league._id, externalId: String(seasonExternalId), name: f.season?.name || `Season ${seasonExternalId}`, active: true }, { upsert: true, new: true, setDefaultsOnInsert: true }) : null;
        const saveTeam = async (p) => Team.findOneAndUpdate({ externalId: String(p?.id ?? '') }, { externalId: String(p?.id ?? ''), name: p?.name || 'Unknown', shortName: p?.short_code || '', logo: p?.image_path || '', active: true }, { upsert: true, new: true, setDefaultsOnInsert: true });
        const homeTeam = await saveTeam(home), awayTeam = await saveTeam(away);
        const scores = Array.isArray(f.scores) ? f.scores : [];
        const currentScores = scores.filter((s) => s.description === 'CURRENT');
        const scoreFor = (participantId) => { const x = currentScores.find((s) => String(s.participant_id) === String(participantId)); return Number(x?.score?.goals ?? 0); };
        const state = f.state?.developer_name || f.state?.short_name || '';
        const status = /LIVE|INPLAY|HALFTIME|1ST_HALF|2ND_HALF/i.test(state) ? 'live' : /FT|FINISHED/i.test(state) ? 'finished' : /POSTPONED/i.test(state) ? 'postponed' : /CANCELLED/i.test(state) ? 'cancelled' : 'scheduled';
        await Match.findOneAndUpdate({ externalId: String(f.id) }, { externalId: String(f.id), leagueId: league._id, seasonId: season?._id, homeTeamId: homeTeam._id, awayTeamId: awayTeam._id, kickoff: new Date(f.starting_at), status, homeScore: scoreFor(home?.id), awayScore: scoreFor(away?.id), venue: { name: f.venue?.name, city: f.venue?.city } }, { upsert: true, new: true, setDefaultsOnInsert: true });
        upserted++;
    }
    return upserted;
}
