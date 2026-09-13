import { env } from './env';

export type ProviderStatus = { configured: boolean; provider: string; baseUrl: string; keyLast4?: string };
function maskKey(value?: string) { return value ? `••••••••${value.slice(-4)}` : undefined; }
export function providerConfig() {
  return {
    sportmonks: { provider: env.FOOTBALL_PROVIDER, baseUrl: env.FOOTBALL_API_BASE_URL, apiKey: env.FOOTBALL_API_KEY },
    odds: { provider: env.ODDS_PROVIDER, baseUrl: env.ODDS_API_BASE_URL, apiKey: env.ODDS_API_KEY || env.FOOTBALL_API_KEY },
    xgoals: { provider: env.XGOALS_PROVIDER, baseUrl: env.XGOALS_API_BASE_URL, apiKey: env.XGOALS_API_KEY || env.FOOTBALL_API_KEY }
  };
}
export function providerStatuses() {
  const c = providerConfig();
  const make = (x: any): ProviderStatus => ({ configured: Boolean(x.apiKey), provider: x.provider, baseUrl: x.baseUrl, keyLast4: maskKey(x.apiKey) });
  return { football: make(c.sportmonks), odds: make(c.odds), xgoals: make(c.xgoals) };
}
