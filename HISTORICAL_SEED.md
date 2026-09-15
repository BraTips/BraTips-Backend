# BraTipsters historical data seed

This seed command populates BraTipsters with real historical match results and bookmaker-average odds for:

- English Premier League (`E0`)
- Bundesliga (`D1`)
- Serie A (`I1`)
- La Liga (`SP1`)

Default range: 2020/21 through 2025/26.

## Source

Match results, match statistics and historical odds are sourced from Football-Data.co.uk. The importer fetches the CSV files at runtime using the published season/division structure.

Source: https://www.football-data.co.uk/data

## Run

```bash
npm install
npm run seed:historical
```

Optional environment variables:

```env
HISTORICAL_START_YEAR=2020
HISTORICAL_END_YEAR=2025
HISTORICAL_TIPS_PER_TIPSTER=180
SEED_TIPSTER_PASSWORD=change-this-after-seeding
```

## Tipsters

The seed creates realistic human-style tipster names such as Kwame Mensah, Daniel Osei, Michael Bennett, Samuel Boateng, James Carter and others.

These tipster identities and their historical predictions are **synthetic seed records for populating/testing the BraTipsters application**. They must not be presented as verified real people or as genuine historical advice from those people.

The match results and bookmaker odds remain based on the real historical source data.

## Idempotency

The importer uses stable external IDs and upserts, so running the command again updates the same historical records rather than creating duplicate matches.
