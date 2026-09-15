# BraTipsters Prediction Engine

The backend now generates automatic daily and 7-day football predictions from the fixtures available in MongoDB/Sportmonks.

## Ensemble

- Poisson/xG-style expected-goals model from historical home/away scoring and conceding rates.
- Elo team-strength model built chronologically from settled matches.
- Sportmonks Prediction API prior when fixture predictions are available.
- Bookmaker implied probability from the latest stored pre-match odds.
- Sportmonks Value Bet API is used when the account has that add-on; its fair-odd/value signal can promote a selection to Premium.

The engine combines these signals, calculates expected value, model agreement and confidence, and publishes one strongest public selection per match plus a second Premium selection when a qualifying value opportunity exists.

## Premium rules

A selection can be Premium when it has odds >= 2.00 and either:

- Sportmonks marks the outcome as a value bet and the ensemble probability is >= 48%, or
- ensemble expected value is >= 10%, probability >= 48%, and Poisson/Elo agreement is >= 72%.

These are screening rules, not guarantees of a winning result.

## Horizons

- `daily`: today's scheduled matches.
- `weekly`: the next seven days.

The scheduler refreshes upcoming fixtures/odds and generates both horizons automatically. Admins can also trigger both with `POST /api/v1/admin/prediction-engine/generate`.

## Premium access

Public users receive the fixture and Premium badge but not the locked selection, odds, confidence or analysis. Active/trialing Premium subscribers receive the complete record. Tipsters always receive all of their own predictions through `/api/v1/me/tipster`.
