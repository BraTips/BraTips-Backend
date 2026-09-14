# BraTipsters Backend API

Express + TypeScript + MongoDB backend for the BraTipsters football/tipster platform.

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

BraTipsters now uses Sportmonks as the football data source. Put the token only in the backend environment:

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
- `GET /api/v1/bet-of-day/recent?limit=8`
- `GET /api/v1/me/picks` (auth)
- `POST /api/v1/me/picks` (auth)
- `DELETE /api/v1/me/picks/:id` (auth)
- `GET /api/v1/me/tipster` (approved tipster auth)
- `POST /api/v1/me/tipster/predictions` (approved tipster auth)

## Stripe subscriptions

BraTipsters uses Stripe Checkout subscriptions and Stripe Billing Portal. The backend does not store card details. Configure the Stripe secret, webhook signing secret, and the four Stripe Price IDs in `.env` (see `.env.example`).

Webhook endpoint:

`POST /api/v1/billing/webhook`

Configure Stripe to send at least:
- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

The webhook is signature-verified and event IDs are stored for idempotent processing. Subscription access should be granted from confirmed webhook state rather than trusting the checkout success redirect.

## Tipster payout workflow

BraTipsters uses a manual tipster payout workflow. Stripe remains the subscription payment processor; no Paystack/automatic payout provider is required.

1. A tipster submits a withdrawal request with their GHS payout method and recipient details.
2. The requested amount is reserved from the tipster's available wallet balance.
3. Admin reviews the recipient details and approves the request.
4. Admin sends the money manually from the BraTipsters business bank/MoMo account.
5. Admin marks the withdrawal as paid. The wallet ledger records the completed payout.
6. If the request is rejected before payment, the reserved amount is returned to the tipster's available balance.


## Transactional email

BraTipsters sends branded transactional email through the Cloudflare Email Service REST API over HTTPS. Configure the Cloudflare Account ID as `CLOUDFLARE_ACCOUNT_ID` in the backend environment. The Cloudflare API token is encrypted before being stored in MongoDB. The REST API endpoint is `https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send` and authenticates with `Authorization: Bearer <API_TOKEN>`.

The sending domain must be onboarded in Cloudflare Email Service and the token must have Email Sending: Edit permission. The Admin Email Configuration page stores the token and sender address; the backend supplies the Cloudflare Account ID from the environment. Emails currently cover: new account welcome, tipster application received, tipster application decisions/updates, and tipster withdrawal status. Set `EMAIL_CONFIG_ENCRYPTION_KEY` (32+ characters) for a dedicated encryption key; if omitted, the JWT access secret is used as the key.
