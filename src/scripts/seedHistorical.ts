import 'dotenv/config';
import crypto from 'node:crypto';
import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { connectDatabase } from '../config/database';
import { League } from '../models/League';
import { Season } from '../models/Season';
import { Team } from '../models/Team';
import { Match } from '../models/Match';
import { User } from '../models/User';
import { TipsterApplication } from '../models/TipsterApplication';
import { TipsterProfile } from '../models/TipsterProfile';
import { Prediction } from '../models/Prediction';
import { OddsSnapshot } from '../models/OddsSnapshot';

/**
 * Historical seed importer for BraTipsters.
 *
 * Match results and bookmaker odds are fetched from Football-Data.co.uk.
 * Tipster identities and predictions are synthetic seed records using realistic
 * human names; they are marked internally as seeded data and must not be
 * presented as verified real-world tipsters or historical published advice.
 */

type LeagueConfig = { key: string; name: string; country: string; division: string };
type CsvRow = Record<string, string>;
type ParsedMatch = {
  date: Date;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  avgH?: number;
  avgD?: number;
  avgA?: number;
  over25?: number;
  under25?: number;
  referee?: string;
  homeShots?: number;
  awayShots?: number;
  homeShotsOnTarget?: number;
  awayShotsOnTarget?: number;
  homeCorners?: number;
  awayCorners?: number;
  homeYellow?: number;
  awayYellow?: number;
  homeRed?: number;
  awayRed?: number;
};

type TipsterSeed = {
  name: string;
  username: string;
  country: string;
  expertise: string[];
  style: 'favorites' | 'goals' | 'value' | 'draws';
  leagueBias: string[];
  bio: string;
};

const LEAGUES: LeagueConfig[] = [
  { key: 'EPL', name: 'Premier League', country: 'England', division: 'E0' },
  { key: 'BL1', name: 'Bundesliga', country: 'Germany', division: 'D1' },
  { key: 'SA', name: 'Serie A', country: 'Italy', division: 'I1' },
  { key: 'LL', name: 'La Liga', country: 'Spain', division: 'SP1' },
];

const TIPSTERS: TipsterSeed[] = [
  { name: 'Kwame Mensah', username: 'kwamemensah', country: 'Ghana', expertise: ['Premier League', '1X2', 'Value Betting'], style: 'favorites', leagueBias: ['EPL'], bio: 'Disciplined football analyst focused on major European leagues, price discipline and repeatable match selection.' },
  { name: 'Daniel Osei', username: 'danielosei', country: 'Ghana', expertise: ['Bundesliga', 'Goals', 'Over/Under'], style: 'goals', leagueBias: ['BL1'], bio: 'Specialises in goal markets with an emphasis on Bundesliga tempo, totals and price movement.' },
  { name: 'Michael Bennett', username: 'michaelbennett', country: 'United Kingdom', expertise: ['Premier League', 'Match Result', 'Value'], style: 'value', leagueBias: ['EPL'], bio: 'Long-form football researcher who looks for mispriced match-result opportunities across the top flight.' },
  { name: 'Samuel Boateng', username: 'samuelboateng', country: 'Ghana', expertise: ['Serie A', 'Draws', 'Double Chance'], style: 'draws', leagueBias: ['SA'], bio: 'Focuses on disciplined Serie A selections, especially draw-related and lower-volatility markets.' },
  { name: 'James Carter', username: 'jamescarter', country: 'United Kingdom', expertise: ['La Liga', '1X2', 'Form'], style: 'favorites', leagueBias: ['LL'], bio: 'La Liga specialist combining market prices with team-strength and home-advantage signals.' },
  { name: 'David Mensah', username: 'davidmensah', country: 'Ghana', expertise: ['Premier League', 'Goals', 'Both Teams To Score'], style: 'goals', leagueBias: ['EPL'], bio: 'Football analyst with a preference for structured goal-market selections and conservative staking logic.' },
  { name: 'Thomas Reed', username: 'thomasreed', country: 'United Kingdom', expertise: ['Bundesliga', '1X2', 'Away Teams'], style: 'value', leagueBias: ['BL1'], bio: 'European football analyst concentrating on price-sensitive Bundesliga match selections.' },
  { name: 'Anthony Owusu', username: 'anthonyowusu', country: 'Ghana', expertise: ['Serie A', 'Goals', 'Totals'], style: 'goals', leagueBias: ['SA'], bio: 'Analyses Italian football with a strong focus on totals and match scoring patterns.' },
  { name: 'Marcus Williams', username: 'marcuswilliams', country: 'United States', expertise: ['Premier League', 'Double Chance', 'Risk Control'], style: 'draws', leagueBias: ['EPL'], bio: 'Risk-focused football analyst who favours robust selections over high-variance long shots.' },
  { name: 'Nathan Asare', username: 'nathanasare', country: 'Ghana', expertise: ['La Liga', 'Goals', 'Value'], style: 'value', leagueBias: ['LL'], bio: 'Spanish football specialist balancing goal expectations, prices and home-away splits.' },
  { name: 'Oliver Grant', username: 'olivergrant', country: 'United Kingdom', expertise: ['Serie A', '1X2', 'Form'], style: 'favorites', leagueBias: ['SA'], bio: 'Match-result analyst focused on major Serie A fixtures and measured price selection.' },
  { name: 'Richard Addo', username: 'richardaddo', country: 'Ghana', expertise: ['All Four Leagues', 'Value', 'Match Analysis'], style: 'value', leagueBias: ['EPL', 'BL1', 'SA', 'LL'], bio: 'Multi-league analyst covering England, Germany, Italy and Spain with a value-oriented approach.' },
];

const START_YEAR = Number(process.env.HISTORICAL_START_YEAR || 2020);
const END_YEAR = Number(process.env.HISTORICAL_END_YEAR || 2025);
const TIP_LIMIT_PER_TIPSTER = Number(process.env.HISTORICAL_TIPS_PER_TIPSTER || 180);
const SOURCE = 'Football-Data.co.uk';
const SEED_TAG = 'historical-seed-2026';

function seasonCode(startYear: number) {
  const a = String(startYear).slice(-2);
  const b = String(startYear + 1).slice(-2);
  return `${a}${b}`;
}

function seasonName(startYear: number) { return `${startYear}/${String(startYear + 1).slice(-2)}`; }

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(x => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(x => x.trim().replace(/^\uFEFF/, ''));
  return rows.slice(1).map(values => Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? '').trim()])));
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(value: string): Date | null {
  const [d, m, yRaw] = value.split('/').map(Number);
  if (!d || !m || !yRaw) return null;
  const y = yRaw < 100 ? (yRaw >= 70 ? 1900 + yRaw : 2000 + yRaw) : yRaw;
  const date = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMatch(row: CsvRow): ParsedMatch | null {
  const date = parseDate(row.Date);
  const homeGoals = num(row.FTHG);
  const awayGoals = num(row.FTAG);
  if (!date || !row.HomeTeam || !row.AwayTeam || homeGoals === undefined || awayGoals === undefined) return null;
  return {
    date, home: row.HomeTeam, away: row.AwayTeam, homeGoals, awayGoals,
    avgH: num(row.AvgH), avgD: num(row.AvgD), avgA: num(row.AvgA),
    over25: num(row['Avg>2.5']), under25: num(row['Avg<2.5']),
    referee: row.Referee || undefined,
    homeShots: num(row.HS), awayShots: num(row.AS), homeShotsOnTarget: num(row.HST), awayShotsOnTarget: num(row.AST),
    homeCorners: num(row.HC), awayCorners: num(row.AC), homeYellow: num(row.HY), awayYellow: num(row.AY), homeRed: num(row.HR), awayRed: num(row.AR),
  };
}

async function downloadSeason(startYear: number, division: string) {
  const code = seasonCode(startYear);
  const url = `https://www.football-data.co.uk/mmz4281/${code}/${division}.csv`;
  const res = await fetch(url, { headers: { 'user-agent': 'BraTipsters historical seed importer' } });
  if (!res.ok) throw new Error(`Failed to download ${url}: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

function safeOdds(value: number | undefined, fallback: number) {
  return value && value >= 1.01 && value <= 100 ? Number(value.toFixed(2)) : fallback;
}

function hashNumber(input: string, min: number, max: number) {
  const h = createHash('sha256').update(input).digest().readUInt32BE(0);
  return min + (h % (max - min + 1));
}

function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function marketFor(t: TipsterSeed, m: ParsedMatch, index: number) {
  const h = m.avgH ?? 2.5, d = m.avgD ?? 3.4, a = m.avgA ?? 2.8;
  if (t.style === 'goals') {
    const over = m.over25 ?? 2.0, under = m.under25 ?? 1.8;
    return over <= under
      ? { prediction: 'Over 2.5 Goals', odds: safeOdds(over, 1.95) }
      : { prediction: 'Under 2.5 Goals', odds: safeOdds(under, 1.85) };
  }
  if (t.style === 'draws') {
    const choice = (index + hashNumber(`${t.username}:${m.home}:${m.away}`, 0, 9)) % 3;
    if (choice === 0) return { prediction: 'Double Chance 1X', odds: safeOdds(Math.min(h, d) * 0.64, 1.28) };
    if (choice === 1) return { prediction: 'Double Chance X2', odds: safeOdds(Math.min(d, a) * 0.64, 1.32) };
    return { prediction: 'Draw', odds: safeOdds(d, 3.2) };
  }
  if (t.style === 'favorites') {
    if (h <= d && h <= a) return { prediction: 'Home Win', odds: safeOdds(h, 2.05) };
    if (a <= h && a <= d) return { prediction: 'Away Win', odds: safeOdds(a, 2.45) };
    return { prediction: 'Draw', odds: safeOdds(d, 3.2) };
  }
  // Value style: deliberately mix favourites and a small amount of draw/away exposure.
  const key = hashNumber(`${t.username}:${m.home}:${m.away}:${m.date.toISOString()}`, 0, 99);
  if (key < 62) {
    if (h <= a) return { prediction: 'Home Win', odds: safeOdds(h, 2.1) };
    return { prediction: 'Away Win', odds: safeOdds(a, 2.5) };
  }
  if (key < 82) return { prediction: 'Double Chance 1X', odds: safeOdds(Math.min(h, d) * 0.66, 1.3) };
  return { prediction: 'Double Chance X2', odds: safeOdds(Math.min(d, a) * 0.66, 1.35) };
}

function evaluate(prediction: string, m: ParsedMatch) {
  const text = prediction.toLowerCase();
  if (text.includes('double chance 1x')) return m.homeGoals >= m.awayGoals ? 'won' : 'lost';
  if (text.includes('double chance x2')) return m.awayGoals >= m.homeGoals ? 'won' : 'lost';
  if (text === 'draw') return m.homeGoals === m.awayGoals ? 'won' : 'lost';
  if (text === 'home win') return m.homeGoals > m.awayGoals ? 'won' : 'lost';
  if (text === 'away win') return m.awayGoals > m.homeGoals ? 'won' : 'lost';
  if (text.includes('over 2.5')) return m.homeGoals + m.awayGoals > 2.5 ? 'won' : 'lost';
  if (text.includes('under 2.5')) return m.homeGoals + m.awayGoals < 2.5 ? 'won' : 'lost';
  return 'void';
}

async function main() {
  if (END_YEAR < START_YEAR) throw new Error('HISTORICAL_END_YEAR must be >= HISTORICAL_START_YEAR');
  await connectDatabase();

  console.log(`\nBraTipsters historical seed: ${START_YEAR}/${String(START_YEAR + 1).slice(-2)} through ${END_YEAR}/${String(END_YEAR + 1).slice(-2)}`);
  console.log(`Source: ${SOURCE}`);

  const leagueDocs = new Map<string, any>();
  for (const cfg of LEAGUES) {
    const league = await League.findOneAndUpdate(
      { name: cfg.name, country: cfg.country },
      { $set: { active: true, externalId: `seed-${cfg.key}` } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    leagueDocs.set(cfg.key, league);
  }

  const matchesByLeague = new Map<string, any[]>();
  let matchCount = 0;
  let oddsCount = 0;

  for (const cfg of LEAGUES) {
    const league = leagueDocs.get(cfg.key)!;
    const matchesForLeague: any[] = [];
    for (let year = START_YEAR; year <= END_YEAR; year++) {
      const rows = await downloadSeason(year, cfg.division);
      const season = await Season.findOneAndUpdate(
        { leagueId: league._id, name: seasonName(year) },
        { $set: { externalId: `seed-${cfg.key}-${seasonCode(year)}`, startDate: new Date(Date.UTC(year, 6, 1)), endDate: new Date(Date.UTC(year + 1, 5, 30)), active: false } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const parsed = rows.map(parseMatch).filter(Boolean) as ParsedMatch[];
      console.log(`  ${cfg.name} ${seasonName(year)}: ${parsed.length} matches`);
      for (const m of parsed) {
        const homeTeam = await Team.findOneAndUpdate(
          { name: m.home, country: cfg.country },
          { $set: { active: true } }, { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const awayTeam = await Team.findOneAndUpdate(
          { name: m.away, country: cfg.country },
          { $set: { active: true } }, { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        const externalId = `fd-${cfg.division}-${seasonCode(year)}-${m.date.toISOString().slice(0,10)}-${slug(m.home)}-${slug(m.away)}`;
        const match = await Match.findOneAndUpdate(
          { externalId },
          { $set: {
            leagueId: league._id, seasonId: season._id, homeTeamId: homeTeam._id, awayTeamId: awayTeam._id,
            kickoff: m.date, status: 'finished', homeScore: m.homeGoals, awayScore: m.awayGoals,
          } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        matchesForLeague.push({ cfg, match, parsed: m, season });
        matchCount++;

        const odds = [
          ['Home Win', m.avgH], ['Draw', m.avgD], ['Away Win', m.avgA], ['Over 2.5 Goals', m.over25], ['Under 2.5 Goals', m.under25],
        ] as Array<[string, number | undefined]>;
        for (const [label, value] of odds) {
          if (!value || value < 1) continue;
          await OddsSnapshot.updateOne(
            { matchId: match._id, fixtureExternalId: externalId, label, mode: 'pre-match' },
            { $set: { value, bookmakerName: 'Football-Data Average', marketName: label.includes('Goals') ? 'Total Goals' : '1X2', recordedAt: m.date } },
            { upsert: true }
          );
          oddsCount++;
        }
      }
    }
    matchesByLeague.set(cfg.key, matchesForLeague);
  }

  const password = process.env.SEED_TIPSTER_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const passwordHash = await bcrypt.hash(password, 10);
  const tipsterUsers: Array<{ seed: TipsterSeed; user: any; profile: any }> = [];

  const allMatches = [...matchesByLeague.values()].flat();
  const fallbackMatch = allMatches[0];
  for (const seed of TIPSTERS) {
    const email = `${seed.username}@seed.bratipsters.local`;
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { name: seed.name, role: 'tipster', status: 'active', passwordHash, seeded: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const sample = fallbackMatch;
    const market = marketFor(seed, sample.parsed, 0);
    const app = await TipsterApplication.findOneAndUpdate(
      { userId: user._id },
      { $set: {
        username: seed.username, country: seed.country, bio: seed.bio, experience: 'Historical seed account for product testing and analytics.', expertise: seed.expertise,
        socialLinks: [], status: 'approved', reviewedAt: new Date(), samplePrediction: {
          fixture: `${sample.parsed.home} vs ${sample.parsed.away}`, league: sample.cfg.name, prediction: market.prediction, odds: market.odds, confidence: 70, analysis: 'Seed profile sample used for historical analytics population.', matchId: sample.match._id, submittedAt: sample.parsed.date,
        }
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const profile = await TipsterProfile.findOneAndUpdate(
      { userId: user._id },
      { $set: { applicationId: app._id, username: seed.username, bio: seed.bio, country: seed.country, expertise: seed.expertise, active: true, seeded: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    tipsterUsers.push({ seed, user, profile });
  }

  let predictionCount = 0;
  const byTipster = new Map<string, any[]>();
  for (const item of tipsterUsers) {
    const candidates = allMatches.filter(x => item.seed.leagueBias.includes('EPL') ? true : true)
      .filter(x => item.seed.leagueBias.includes(x.cfg.key) || item.seed.leagueBias.includes('EPL') && x.cfg.key === 'EPL' || item.seed.leagueBias.length > 1);
    // Keep the multi-league analyst broad; specialists get their selected league first.
    const ordered = candidates.sort((a, b) => a.parsed.date.getTime() - b.parsed.date.getTime());
    const selected = ordered.filter((x, i) => {
      if (item.seed.leagueBias.length > 1) return i % 3 !== 1;
      return true;
    }).slice(-TIP_LIMIT_PER_TIPSTER);
    const used = new Set<string>();
    const created: any[] = [];
    for (let i = 0; i < selected.length; i++) {
      const x = selected[i];
      const key = String(x.match._id);
      if (used.has(key)) continue;
      used.add(key);
      const market = marketFor(item.seed, x.parsed, i);
      const status = evaluate(market.prediction, x.parsed) as 'won' | 'lost';
      const prediction = await Prediction.findOneAndUpdate(
        { tipsterId: item.user._id, matchId: x.match._id },
        { $set: {
          tipsterId: item.user._id, matchId: x.match._id, fixture: `${x.parsed.home} vs ${x.parsed.away}`, league: x.cfg.name,
          prediction: market.prediction, odds: market.odds, isPremium: i % 5 === 0, confidence: 58 + hashNumber(`${item.seed.username}:${key}`, 0, 35),
          analysis: `${item.seed.name}'s historical seed selection for ${x.cfg.name}. This record is generated for product testing from published match and market data.`,
          status, profit: status === 'won' ? Number((market.odds - 1).toFixed(2)) : -1, publishedAt: x.parsed.date, resultAt: new Date(x.parsed.date.getTime() + 3 * 60 * 60 * 1000), seeded: true,
        } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      created.push(prediction);
      predictionCount++;
    }
    byTipster.set(String(item.user._id), created);

    const settled = created.filter(p => p.status === 'won' || p.status === 'lost');
    const wins = settled.filter(p => p.status === 'won').length;
    const losses = settled.filter(p => p.status === 'lost').length;
    const profit = settled.reduce((sum, p) => sum + Number(p.profit || 0), 0);
    const roi = settled.length ? Number((profit / settled.length * 100).toFixed(2)) : 0;
    await TipsterProfile.updateOne({ _id: item.profile._id }, { $set: { totalTips: settled.length, wins, losses, profit: Number(profit.toFixed(2)), roi } });
  }

  console.log('\nSeed complete.');
  console.log(`Leagues: ${LEAGUES.length}`);
  console.log(`Matches upserted: ${matchCount}`);
  console.log(`Odds snapshots upserted: ${oddsCount}`);
  console.log(`Tipsters: ${tipsterUsers.length}`);
  console.log(`Predictions upserted: ${predictionCount}`);
  console.log(`Seed tag: ${SEED_TAG}`);
  console.log(`Tipster seed password: ${password}`);
  console.log('IMPORTANT: tipster accounts and predictions are synthetic seed data, even though the match/odds source is real historical data.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
