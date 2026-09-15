import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
  NODE_ENV: z.enum(['development','test','production']).default('development'), PORT: z.coerce.number().default(5000),
  MONGODB_URI: z.string().min(1), JWT_ACCESS_SECRET: z.string().min(32), JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'), REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  WEB_URL: z.string().url(), ADMIN_URL: z.string().url(), REDIS_URL: z.string().optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.string().email(), ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12), ADMIN_BOOTSTRAP_NAME: z.string().min(2).max(100),
  STRIPE_SECRET_KEY: z.string().optional(), STRIPE_WEBHOOK_SECRET: z.string().optional(), STRIPE_CURRENCY: z.string().default('usd'), TIPSTER_REWARD_CURRENCY: z.string().default('usd'), STRIPE_PRICE_LITE_MONTHLY: z.string().optional(), STRIPE_PRICE_PREMIUM_MONTHLY: z.string().optional(), STRIPE_PRICE_LITE_YEARLY: z.string().optional(), STRIPE_PRICE_PREMIUM_YEARLY: z.string().optional(),
  FOOTBALL_PROVIDER: z.string().default('sportmonks'), FOOTBALL_API_BASE_URL: z.string().url().default('https://api.sportmonks.com/v3/football'), FOOTBALL_API_KEY: z.string().optional(),
  ODDS_PROVIDER: z.string().default('sportmonks'), ODDS_API_BASE_URL: z.string().url().default('https://api.sportmonks.com/v3/football'), ODDS_API_KEY: z.string().optional(),
  XGOALS_PROVIDER: z.string().default('sportmonks'), XGOALS_API_BASE_URL: z.string().url().default('https://api.sportmonks.com/v3/football'), XGOALS_API_KEY: z.string().optional(), EMAIL_CONFIG_ENCRYPTION_KEY: z.string().min(32).optional(), CLOUDFLARE_ACCOUNT_ID: z.string().optional(), OPENAI_API_KEY: z.string().optional(), OPENAI_MODEL: z.string().default('gpt-5.6-luna')
}).superRefine((v,ctx)=>{
  if(v.STRIPE_SECRET_KEY && v.STRIPE_CURRENCY.toUpperCase()!==v.TIPSTER_REWARD_CURRENCY.toUpperCase()){
    ctx.addIssue({code:'custom',path:['TIPSTER_REWARD_CURRENCY'],message:'TIPSTER_REWARD_CURRENCY must match STRIPE_CURRENCY when Stripe is enabled. Tipster rewards do not perform FX conversion.'});
  }
});
export const env = schema.parse(process.env);
