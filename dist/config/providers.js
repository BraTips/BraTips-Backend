"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerConfig = providerConfig;
exports.providerStatuses = providerStatuses;
const env_1 = require("./env");
function maskKey(value) { return value ? `••••••••${value.slice(-4)}` : undefined; }
function providerConfig() {
    return {
        sportmonks: { provider: env_1.env.FOOTBALL_PROVIDER, baseUrl: env_1.env.FOOTBALL_API_BASE_URL, apiKey: env_1.env.FOOTBALL_API_KEY },
        odds: { provider: env_1.env.ODDS_PROVIDER, baseUrl: env_1.env.ODDS_API_BASE_URL, apiKey: env_1.env.ODDS_API_KEY || env_1.env.FOOTBALL_API_KEY },
        xgoals: { provider: env_1.env.XGOALS_PROVIDER, baseUrl: env_1.env.XGOALS_API_BASE_URL, apiKey: env_1.env.XGOALS_API_KEY || env_1.env.FOOTBALL_API_KEY }
    };
}
function providerStatuses() {
    const c = providerConfig();
    const make = (x) => ({ configured: Boolean(x.apiKey), provider: x.provider, baseUrl: x.baseUrl, keyLast4: maskKey(x.apiKey) });
    return { football: make(c.sportmonks), odds: make(c.odds), xgoals: make(c.xgoals) };
}
