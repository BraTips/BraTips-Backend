# BraTips Backend API

Express + TypeScript + MongoDB backend for the BraTips football/tipster platform.

## Provider API configuration

External provider secrets belong **only** in the backend environment (`.env` or your deployment secret manager). Never put them in the Vue admin `.env` or any `VITE_*` variable.

```env
# Odds dropping / odds feed
ODDS_PROVIDER=the-odds-api
ODDS_API_BASE_URL=https://api.the-odds-api.com/v4
ODDS_API_KEY=

# Live football / fixtures
FOOTBALL_PROVIDER=api-football
FOOTBALL_API_BASE_URL=https://v3.football.api-sports.io
FOOTBALL_API_KEY=

# xGoals / analytics provider (pluggable)
XGOALS_PROVIDER=internal
XGOALS_API_BASE_URL=http://localhost:5000
XGOALS_API_KEY=
```

The admin Settings page reads `/api/v1/admin/integrations/config`, which returns only provider name, base URL and a masked key. Raw secrets are never returned to the frontend.

## Admin endpoints

- `GET /api/v1/admin/dashboard` — dashboard totals
- `GET /api/v1/admin/analytics/overview?days=30` — platform analytics
- `GET /api/v1/admin/integrations/config` — safe provider configuration/status
- `GET /api/v1/admin/integrations/health` — provider/database health summary
- `POST /api/v1/admin/integrations/sync` — accepts a sync request
- `GET /api/v1/admin/providers/odds?sport=soccer_epl` — server-side odds provider request
- `GET /api/v1/admin/providers/live-football` — server-side live fixtures request
- `GET /api/v1/admin/providers/trends` — prediction trend aggregation
- `GET /api/v1/admin/providers/xgoals` — xGoals integration placeholder/aggregation
- `GET /api/v1/admin/tipster-applications` — applications with sample predictions
- `PATCH /api/v1/admin/tipster-applications/:id/review` — approve/reject/review/suspend
- `GET /api/v1/admin/tipsters` — approved tipsters
- `GET /api/v1/admin/predictions` — prediction moderation

## Security

Provider API keys are read server-side and passed to providers from the backend. Do not expose them through browser code, Vite environment variables, source control, or API responses.

## Sportmonks integration

BraTips now uses Sportmonks as the football data source. Put the token only in the backend environment:

```env
FOOTBALL_PROVIDER=sportmonks
FOOTBALL_API_BASE_URL=https://api.sportmonks.com/v3/football
FOOTBALL_API_KEY=YOUR_SPORTMONKS_TOKEN
ODDS_PROVIDER=sportmonks
ODDS_API_BASE_URL=https://api.sportmonks.com/v3/football
XGOALS_PROVIDER=sportmonks
XGOALS_API_BASE_URL=https://api.sportmonks.com/v3/football
```

Admin endpoints proxy Sportmonks server-side for live scores, fixtures, odds, xG, match events, lineups, statistics and predictions. Never use a `VITE_` variable for the Sportmonks token.

## Admin automation features

The backend now includes four admin-only operations:
- automatic football synchronization (daily at 02:00 server time plus a live sync loop every 5 minutes), with persisted sync history;
- tipster winning-streak rewards with configurable rules and an auditable reward ledger;
- AI Bet of the Day generation for exactly two daily picks, with admin approval before publishing;
- settled prediction history and performance statistics.

Optional AI configuration belongs only in the backend environment:
`OPENAI_API_KEY` and `OPENAI_MODEL` (default `gpt-5.6-luna`). If no AI key is configured, Bet of the Day falls back to a conservative deterministic selection and clearly labels the model as `heuristic`.

## Public/user API additions
- `GET /api/v1/tipsters`
- `GET /api/v1/tipsters/:username`
- `GET /api/v1/predictions`
- `GET /api/v1/predictions/:id`
- `GET /api/v1/prediction-history`
- `GET /api/v1/bet-of-day`
- `GET /api/v1/me/picks` (auth)
- `POST /api/v1/me/picks` (auth)
- `DELETE /api/v1/me/picks/:id` (auth)
- `GET /api/v1/me/tipster` (approved tipster auth)
- `POST /api/v1/me/tipster/predictions` (approved tipster auth)
