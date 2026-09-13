"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const schema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'), PORT: zod_1.z.coerce.number().default(5000),
    MONGODB_URI: zod_1.z.string().min(1), JWT_ACCESS_SECRET: zod_1.z.string().min(32), JWT_REFRESH_SECRET: zod_1.z.string().min(32),
    ACCESS_TOKEN_EXPIRES_IN: zod_1.z.string().default('15m'), REFRESH_TOKEN_EXPIRES_IN: zod_1.z.string().default('7d'),
    WEB_URL: zod_1.z.string().url(), ADMIN_URL: zod_1.z.string().url(), REDIS_URL: zod_1.z.string().optional(),
    ADMIN_BOOTSTRAP_EMAIL: zod_1.z.string().email(), ADMIN_BOOTSTRAP_PASSWORD: zod_1.z.string().min(12), ADMIN_BOOTSTRAP_NAME: zod_1.z.string().min(2).max(100),
    FOOTBALL_PROVIDER: zod_1.z.string().default('sportmonks'), FOOTBALL_API_BASE_URL: zod_1.z.string().url().default('https://api.sportmonks.com/v3/football'), FOOTBALL_API_KEY: zod_1.z.string().optional(),
    ODDS_PROVIDER: zod_1.z.string().default('sportmonks'), ODDS_API_BASE_URL: zod_1.z.string().url().default('https://api.sportmonks.com/v3/football'), ODDS_API_KEY: zod_1.z.string().optional(),
    XGOALS_PROVIDER: zod_1.z.string().default('sportmonks'), XGOALS_API_BASE_URL: zod_1.z.string().url().default('https://api.sportmonks.com/v3/football'), XGOALS_API_KEY: zod_1.z.string().optional(), OPENAI_API_KEY: zod_1.z.string().optional(), OPENAI_MODEL: zod_1.z.string().default('gpt-5.6-luna')
});
exports.env = schema.parse(process.env);
