import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { BetOfDay } from '../models/BetOfDay';
import { env } from '../config/env';
import { OddsSnapshot } from '../models/OddsSnapshot';

type MarketFamily = 'result' | 'doubleChance' | 'totalGoals' | 'btts' | 'drawNoBet' | 'teamGoals' | 'cleanSheet' | 'correctScore' | 'other';
type OptionSource = 'ensemble' | 'bookmaker' | 'model';

type MarketOption = {
  matchId: string;
  prediction: string;
  odds?: number;
  confidence: number;
  risk: string;
  analysis: string;
  family: MarketFamily;
  source: OptionSource;
  score: number;
};

type AiPick = {
  matchId: string;
  prediction: string;
  confidence: number;
  risk: string;
  analysis: string;
};

const FAMILY_ROTATION: MarketFamily[] = ['totalGoals', 'btts', 'result', 'drawNoBet', 'teamGoals', 'doubleChance', 'cleanSheet'];
const FALLBACK_MARKETS: Array<{ prediction: string; family: MarketFamily; confidence: number; risk: string }> = [
  { prediction: 'Over 1.5 Goals', family: 'totalGoals', confidence: 64, risk: 'low' },
  { prediction: 'Under 3.5 Goals', family: 'totalGoals', confidence: 62, risk: 'low' },
  { prediction: 'BTTS - Yes', family: 'btts', confidence: 60, risk: 'medium' },
  { prediction: 'BTTS - No', family: 'btts', confidence: 57, risk: 'medium' },
  { prediction: 'Home Win', family: 'result', confidence: 59, risk: 'medium' },
  { prediction: 'Away Win', family: 'result', confidence: 56, risk: 'medium' },
  { prediction: 'Draw No Bet - Home', family: 'drawNoBet', confidence: 63, risk: 'low' },
  { prediction: 'Draw No Bet - Away', family: 'drawNoBet', confidence: 59, risk: 'medium' },
  { prediction: 'Home Team To Score', family: 'teamGoals', confidence: 62, risk: 'low' },
  { prediction: 'Away Team To Score', family: 'teamGoals', confidence: 58, risk: 'medium' },
  { prediction: 'Double Chance 12', family: 'doubleChance', confidence: 61, risk: 'low' }
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

function hashText(value: string) {
  let hash = 7;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash;
}

function normaliseText(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[_/]/g, ' ')
    .replace(/\s*\+\s*/g, ' + ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLine(text: string) {
  const match = text.match(/\b(over|under)\s*(\d+(?:\.\d+)?)\b/);
  return match ? { side: match[1] as 'over' | 'under', line: Number(match[2]) } : null;
}

function lineKey(value: number) {
  return Number(value).toFixed(1);
}

function sideLabel(side: 'over' | 'under') {
  return side === 'over' ? 'Over' : 'Under';
}

function exactTeamLabel(label: string, teamName: string) {
  const team = normaliseText(teamName);
  return Boolean(team && (label === team || label === team.replace(/\bfc\b/g, '').trim()));
}

function canonicalPrediction(value: string): string | null {
  const text = normaliseText(value);
  const correct = text.match(/correct score\s*(\d+)\s*[-:]\s*(\d+)/);
  if (correct) return `Correct Score ${Number(correct[1])}-${Number(correct[2])}`;

  if (/draw no bet|\bdnb\b/.test(text)) {
    if (/home|team 1|\b1\b/.test(text)) return 'Draw No Bet - Home';
    if (/away|team 2|\b2\b/.test(text)) return 'Draw No Bet - Away';
  }

  if (/double\s*chance/.test(text) || /\b(1x|x2|12)\b/.test(text)) {
    const token = (text.match(/\b(1x|x2|12)\b/) || [])[1];
    if (token === '1x') return 'Double Chance 1X';
    if (token === 'x2') return 'Double Chance X2';
    if (token === '12') return 'Double Chance 12';
  }

  if (/btts|both teams.*score|both to score/.test(text)) {
    const line = parseLine(text);
    if (line) return `BTTS + ${sideLabel(line.side)} ${lineKey(line.line)} Goals`;
    if (/\+\s*home win|home win/.test(text)) return 'BTTS + Home Win';
    if (/\+\s*away win|away win/.test(text)) return 'BTTS + Away Win';
    if (/\+\s*draw|\bdraw\b|\bx\b/.test(text)) return 'BTTS + Draw';
    if (/\bno\b/.test(text)) return 'BTTS - No';
    return 'BTTS - Yes';
  }

  if (/home clean sheet/.test(text)) return 'Home Clean Sheet';
  if (/away clean sheet/.test(text)) return 'Away Clean Sheet';
  if (/home team to score|home to score/.test(text)) return 'Home Team To Score';
  if (/away team to score|away to score/.test(text)) return 'Away Team To Score';

  const homeLine = text.match(/home\s+(over|under)\s*(\d+(?:\.\d+)?)/);
  if (homeLine) return `Home ${sideLabel(homeLine[1] as 'over' | 'under')} ${lineKey(Number(homeLine[2]))} Goals`;
  const awayLine = text.match(/away\s+(over|under)\s*(\d+(?:\.\d+)?)/);
  if (awayLine) return `Away ${sideLabel(awayLine[1] as 'over' | 'under')} ${lineKey(Number(awayLine[2]))} Goals`;

  const totalLine = parseLine(text);
  if (totalLine) return `${sideLabel(totalLine.side)} ${lineKey(totalLine.line)} Goals`;

  if (/draw|tie/.test(text)) return 'Draw';
  if (/away\s*(win|to win)|\b2\b/.test(text)) return 'Away Win';
  if (/home\s*(win|to win)|\b1\b/.test(text)) return 'Home Win';
  return null;
}

function familyForPrediction(prediction: string): MarketFamily {
  const text = normaliseText(prediction);
  if (/correct score/.test(text)) return 'correctScore';
  if (/double chance/.test(text)) return 'doubleChance';
  if (/draw no bet/.test(text)) return 'drawNoBet';
  if (/btts|both teams/.test(text)) return 'btts';
  if (/clean sheet/.test(text)) return 'cleanSheet';
  if (/home team to score|away team to score|home (over|under)|away (over|under)/.test(text)) return 'teamGoals';
  if (/(over|under)\s*\d/.test(text)) return 'totalGoals';
  if (/home win|away win|^draw$/.test(text)) return 'result';
  return 'other';
}

function riskFor(prediction: string, odds?: number) {
  const family = familyForPrediction(prediction);
  if (family === 'correctScore' || normaliseText(prediction) === 'draw' || (odds && odds >= 3)) return 'high';
  if (family === 'result' || family === 'btts' || (odds && odds >= 1.85)) return 'medium';
  return 'low';
}

function confidenceFromOdds(odds: number | undefined, fallback = 60) {
  if (!odds || !Number.isFinite(odds) || odds <= 1) return fallback;
  return round(clamp(48 + (1 / odds) * 46, 52, 84), 1);
}

function familyBonus(family: MarketFamily, date: string) {
  const shift = hashText(date) % FAMILY_ROTATION.length;
  const rotated = [...FAMILY_ROTATION.slice(shift), ...FAMILY_ROTATION.slice(0, shift)];
  const index = rotated.indexOf(family);
  return index === -1 ? 0 : (rotated.length - index) * 1.4;
}

function marketScore(option: Omit<MarketOption, 'score'>, date: string) {
  const odds = option.odds;
  const oddsBand = !odds ? -1 : odds < 1.12 ? -6 : odds > 5 ? -10 : odds > 3 ? -4 : odds >= 1.45 && odds <= 2.3 ? 5 : 0;
  const sourceBonus = option.source === 'ensemble' ? 8 : option.source === 'bookmaker' ? 2 : 0;
  const doubleChancePenalty = option.family === 'doubleChance' ? -8 : 0;
  const correctScorePenalty = option.family === 'correctScore' ? -12 : 0;
  const jitter = (hashText(`${date}:${option.matchId}:${option.prediction}`) % 100) / 1000;
  return option.confidence + oddsBand + sourceBonus + familyBonus(option.family, date) + doubleChancePenalty + correctScorePenalty + jitter;
}

function createOption(input: Omit<MarketOption, 'score' | 'family' | 'risk'> & { family?: MarketFamily; risk?: string }, date: string): MarketOption {
  const family = input.family || familyForPrediction(input.prediction);
  const risk = input.risk || riskFor(input.prediction, input.odds);
  const option = { ...input, family, risk, confidence: round(clamp(input.confidence, 50, 95), 1) };
  return { ...option, score: round(marketScore(option, date), 3) };
}

function marketFromOdd(odd: any, match: any) {
  const label = String(odd.label || '');
  const market = String(odd.marketName || '');
  const labelOnly = normaliseText(label);
  const marketOnly = normaliseText(market);
  const text = normaliseText(`${market} ${label}`);
  const homeName = String(match.homeTeamId?.name || match.homeTeamId?.shortName || '');
  const awayName = String(match.awayTeamId?.name || match.awayTeamId?.shortName || '');
  const labelIsHome = ['1', 'home', 'team 1'].includes(labelOnly) || exactTeamLabel(labelOnly, homeName);
  const labelIsAway = ['2', 'away', 'team 2'].includes(labelOnly) || exactTeamLabel(labelOnly, awayName);
  const resultMarket = /1x2|fulltime result|full time result|match winner|winner|result/.test(marketOnly);
  const unsupported = /corner|card|booking|player|shot|assist|offside|throw in|foul|save/.test(text)
    || /half time|half-time|1st half|first half|ht ft|first goal|last goal|\b\d{1,2}-\d{1,2}\s*minutes?\b/.test(text);
  if (unsupported) return null;

  if (/correct score|exact score/.test(text)) {
    const score = text.match(/\b(\d+)\s*[-:]\s*(\d+)\b/);
    if (score) return `Correct Score ${Number(score[1])}-${Number(score[2])}`;
  }

  if (/draw no bet|\bdnb\b/.test(text)) {
    if (labelIsHome || /home|team 1|\b1\b/.test(text)) return 'Draw No Bet - Home';
    if (labelIsAway || /away|team 2|\b2\b/.test(text)) return 'Draw No Bet - Away';
  }

  if (/clean sheet/.test(text)) {
    if ((labelIsHome || /home|team 1/.test(text)) && !/\bno\b/.test(labelOnly)) return 'Home Clean Sheet';
    if ((labelIsAway || /away|team 2/.test(text)) && !/\bno\b/.test(labelOnly)) return 'Away Clean Sheet';
  }

  if (/both teams.*score|btts|both to score/.test(text)) {
    const line = parseLine(text);
    if (line) return `BTTS + ${sideLabel(line.side)} ${lineKey(line.line)} Goals`;
    if (/home win|home to win|\b1\b/.test(text)) return 'BTTS + Home Win';
    if (/away win|away to win|\b2\b/.test(text)) return 'BTTS + Away Win';
    if (/\bdraw\b|\bx\b/.test(text)) return 'BTTS + Draw';
    if (/\bno\b/.test(labelOnly) || /\bno\b/.test(text)) return 'BTTS - No';
    return 'BTTS - Yes';
  }

  const teamLine = parseLine(text);
  if (teamLine && /team goals|home goals|away goals|home team total|away team total/.test(text)) {
    if (labelIsHome || /home|team 1/.test(text)) return `Home ${sideLabel(teamLine.side)} ${lineKey(teamLine.line)} Goals`;
    if (labelIsAway || /away|team 2/.test(text)) return `Away ${sideLabel(teamLine.side)} ${lineKey(teamLine.line)} Goals`;
  }

  if (/home team to score|home to score/.test(text) && !/first|last/.test(text)) return 'Home Team To Score';
  if (/away team to score|away to score/.test(text) && !/first|last/.test(text)) return 'Away Team To Score';

  if (/double chance/.test(text) || ['1x', 'x2', '12'].includes(labelOnly)) {
    if (/\b1x\b/.test(text) || /home.*draw|draw.*home|team 1.*draw|draw.*team 1/.test(text) || labelOnly === '1x') return 'Double Chance 1X';
    if (/\bx2\b/.test(text) || /away.*draw|draw.*away|team 2.*draw|draw.*team 2/.test(text) || labelOnly === 'x2') return 'Double Chance X2';
    if (/\b12\b/.test(text) || /home.*away|away.*home|no draw|team 1.*team 2|team 2.*team 1/.test(text) || labelOnly === '12') return 'Double Chance 12';
  }

  const totalLine = parseLine(text);
  if (totalLine && !/team/.test(text)) return `${sideLabel(totalLine.side)} ${lineKey(totalLine.line)} Goals`;

  if ((labelIsHome && resultMarket) || /home win|home to win/.test(text)) return 'Home Win';
  if ((labelIsAway && resultMarket) || /away win|away to win/.test(text)) return 'Away Win';
  if ((labelOnly === 'x' && resultMarket) || /\bdraw\b|\btie\b/.test(text)) return 'Draw';
  return null;
}

function optionFromPrediction(prediction: any, date: string): MarketOption | null {
  if (!prediction?.matchId) return null;
  const canonical = canonicalPrediction(String(prediction.prediction || '')) || String(prediction.prediction || '').trim();
  if (!canonical) return null;
  const odds = Number(prediction.odds);
  const cleanOdds = Number.isFinite(odds) && odds >= 1 ? odds : undefined;
  return createOption({
    matchId: String(prediction.matchId),
    prediction: canonical,
    odds: cleanOdds,
    confidence: Number(prediction.confidence ?? prediction.modelScore ?? confidenceFromOdds(cleanOdds)),
    analysis: prediction.analysis || 'Ensemble prediction candidate selected from the daily model.',
    source: 'ensemble'
  }, date);
}

function optionFromOdd(odd: any, match: any, date: string): MarketOption | null {
  const prediction = marketFromOdd(odd, match);
  const odds = Number(odd.value);
  if (!prediction || !Number.isFinite(odds) || odds < 1.01) return null;
  if (familyForPrediction(prediction) === 'correctScore' && odds > 12) return null;
  const bookmaker = odd.bookmakerName ? ` from ${odd.bookmakerName}` : '';
  const market = odd.marketName ? ` (${odd.marketName})` : '';
  return createOption({
    matchId: String(odd.matchId),
    prediction,
    odds,
    confidence: confidenceFromOdds(odds),
    analysis: `Bookmaker price${bookmaker}${market}; selected from supported markets instead of defaulting to double chance.`,
    source: 'bookmaker'
  }, date);
}

function putOption(byMatch: Map<string, Map<string, MarketOption>>, option: MarketOption) {
  if (!byMatch.has(option.matchId)) byMatch.set(option.matchId, new Map());
  const options = byMatch.get(option.matchId)!;
  const key = normaliseText(option.prediction);
  const existing = options.get(key);
  if (!existing || option.source === 'ensemble' && existing.source !== 'ensemble' || option.score > existing.score || (option.odds || 0) > (existing.odds || 0)) {
    options.set(key, option);
  }
}

async function loadMarketOptions(matches: any[], date: string) {
  const ids = matches.map((m: any) => m._id);
  const matchById = new Map(matches.map((m: any) => [String(m._id), m]));
  const byMatch = new Map<string, Map<string, MarketOption>>();
  const [predictions, odds] = await Promise.all([
    Prediction.find({ matchId: { $in: ids }, status: 'published', systemGenerated: true, source: 'ensemble', horizon: 'daily' }).lean(),
    OddsSnapshot.find({ matchId: { $in: ids }, mode: 'pre-match', value: { $gte: 1.01 } }).sort({ recordedAt: -1 }).limit(Math.max(300, ids.length * 120)).lean()
  ]);

  for (const odd of odds) {
    const match = matchById.get(String(odd.matchId));
    if (!match) continue;
    const option = optionFromOdd(odd, match, date);
    if (option) putOption(byMatch, option);
  }

  for (const prediction of predictions) {
    const option = optionFromPrediction(prediction, date);
    if (option) putOption(byMatch, option);
  }

  return new Map([...byMatch.entries()].map(([matchId, options]) => [
    matchId,
    [...options.values()].sort((a, b) => b.score - a.score || b.confidence - a.confidence).slice(0, 14)
  ]));
}

function buildAiCandidates(matches: any[], optionsByMatch: Map<string, MarketOption[]>) {
  return matches.map((m: any) => {
    const matchId = String(m._id);
    return {
      matchId,
      fixture: `${m.homeTeamId?.name || 'Home'} vs ${m.awayTeamId?.name || 'Away'}`,
      league: m.leagueId?.name || '',
      kickoff: m.kickoff,
      availableMarkets: (optionsByMatch.get(matchId) || []).slice(0, 10).map((option) => ({
        prediction: option.prediction,
        odds: option.odds,
        confidence: option.confidence,
        risk: option.risk,
        family: option.family,
        source: option.source
      }))
    };
  });
}

async function openAISelect(candidates: any[]) {
  const key = env.OPENAI_API_KEY;
  if (!key) return null;
  const model = env.OPENAI_MODEL;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: 'Select exactly 2 upcoming football matches for an admin Bet of the Day. Do not call anything guaranteed or safe. Consider all available market families: 1X2 result, draw no bet, total goals, BTTS, team goals, clean sheets, and double chance. Double chance is one option, not the default. When a candidate has availableMarkets, the prediction MUST exactly match one availableMarkets.prediction value for that match. Pick two different matches and avoid repeating the same market family when a credible alternative is available. Return strict JSON object with picks containing matchId, prediction, confidence, risk, analysis.'
        },
        { role: 'user', content: JSON.stringify(candidates) }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'bet_of_day',
          schema: {
            type: 'object',
            properties: {
              picks: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    matchId: { type: 'string' },
                    prediction: { type: 'string' },
                    confidence: { type: 'number' },
                    risk: { type: 'string' },
                    analysis: { type: 'string' }
                  },
                  required: ['matchId', 'prediction', 'confidence', 'risk', 'analysis'],
                  additionalProperties: false
                },
                minItems: 2,
                maxItems: 2
              }
            },
            required: ['picks'],
            additionalProperties: false
          },
          strict: true
        }
      }
    })
  });
  if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
  const body: any = await response.json();
  const text = body.output?.flatMap((x: any) => x.content || []).find((x: any) => x.type === 'output_text')?.text;
  return text ? JSON.parse(text).picks as AiPick[] : null;
}

function normalizeAiPicks(rawPicks: AiPick[] | null, matches: any[], optionsByMatch: Map<string, MarketOption[]>, date: string) {
  const matchIds = new Set(matches.map((m: any) => String(m._id)));
  const seenMatches = new Set<string>();
  const picks: MarketOption[] = [];

  for (const pick of rawPicks || []) {
    const matchId = String(pick.matchId || '');
    if (!matchIds.has(matchId) || seenMatches.has(matchId)) continue;
    const canonical = canonicalPrediction(String(pick.prediction || ''));
    if (!canonical) continue;

    const options = optionsByMatch.get(matchId) || [];
    const exact = options.find((option) => normaliseText(option.prediction) === normaliseText(canonical));
    const confidence = Number.isFinite(Number(pick.confidence)) ? Number(pick.confidence) : exact?.confidence ?? confidenceFromOdds(exact?.odds);
    const aiAnalysis = String(pick.analysis || '').trim();

    if (exact) {
      picks.push(createOption({
        ...exact,
        confidence,
        risk: pick.risk || exact.risk,
        analysis: aiAnalysis ? `${aiAnalysis} Market context: ${exact.analysis}` : exact.analysis
      }, date));
      seenMatches.add(matchId);
      continue;
    }

    if (!options.length) {
      picks.push(createOption({
        matchId,
        prediction: canonical,
        confidence,
        risk: pick.risk || riskFor(canonical),
        analysis: aiAnalysis || 'AI model-only selection. No priced market was available for this match.',
        source: 'model'
      }, date));
      seenMatches.add(matchId);
    }
  }

  return picks;
}

function modelFallbackOptions(matches: any[], date: string) {
  const start = hashText(date) % FALLBACK_MARKETS.length;
  const selectedFamilies = new Set<MarketFamily>();
  const options: MarketOption[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    let market = FALLBACK_MARKETS[(start + i * 3) % FALLBACK_MARKETS.length];
    for (let step = 0; step < FALLBACK_MARKETS.length && selectedFamilies.has(market.family); step++) {
      market = FALLBACK_MARKETS[(start + i * 3 + step + 1) % FALLBACK_MARKETS.length];
    }
    selectedFamilies.add(market.family);
    options.push(createOption({
      matchId: String(match._id),
      prediction: market.prediction,
      confidence: market.confidence,
      risk: market.risk,
      analysis: 'Deterministic fallback selection based on scheduled fixture availability and a rotating mix of supported market families; review live odds before staking.',
      source: 'model',
      family: market.family
    }, date));
  }

  return options;
}

function allOptions(matches: any[], optionsByMatch: Map<string, MarketOption[]>, date: string) {
  const priced = matches.flatMap((match: any) => optionsByMatch.get(String(match._id)) || []);
  const pricedMatches = new Set(priced.map((option) => option.matchId));
  const fallback = pricedMatches.size >= 2
    ? []
    : modelFallbackOptions(matches, date).filter((option) => !pricedMatches.has(option.matchId));
  return [...priced, ...fallback]
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence);
}

function diversifyPair(picks: MarketOption[], matches: any[], optionsByMatch: Map<string, MarketOption[]>, date: string) {
  if (picks.length < 2 || picks[0].family !== picks[1].family) return picks.slice(0, 2);
  const alternatives = allOptions(matches, optionsByMatch, date)
    .filter((option) => option.matchId !== picks[0].matchId && option.family !== picks[0].family);
  const replacement = alternatives[0];
  if (replacement && (picks[1].family === 'doubleChance' || replacement.score >= picks[1].score - 8)) {
    return [picks[0], replacement];
  }
  return picks.slice(0, 2);
}

function completePicks(basePicks: MarketOption[], matches: any[], optionsByMatch: Map<string, MarketOption[]>, date: string) {
  const picks: MarketOption[] = [];
  const usedMatches = new Set<string>();
  const usedFamilies = new Set<MarketFamily>();

  for (const pick of basePicks.sort((a, b) => b.score - a.score)) {
    if (picks.length >= 2 || usedMatches.has(pick.matchId)) continue;
    picks.push(pick);
    usedMatches.add(pick.matchId);
    usedFamilies.add(pick.family);
  }

  const candidates = allOptions(matches, optionsByMatch, date);
  for (const candidate of candidates) {
    if (picks.length >= 2) break;
    if (usedMatches.has(candidate.matchId)) continue;
    const hasOtherFamily = candidates.some((option) => !usedMatches.has(option.matchId) && !usedFamilies.has(option.family));
    if (usedFamilies.has(candidate.family) && hasOtherFamily) continue;
    picks.push(candidate);
    usedMatches.add(candidate.matchId);
    usedFamilies.add(candidate.family);
  }

  for (const candidate of candidates) {
    if (picks.length >= 2) break;
    if (usedMatches.has(candidate.matchId)) continue;
    picks.push(candidate);
    usedMatches.add(candidate.matchId);
  }

  return diversifyPair(picks, matches, optionsByMatch, date);
}

export async function generateBetOfDay(date = new Date().toISOString().slice(0, 10)) {
  const from = new Date(`${date}T00:00:00.000Z`);
  const to = new Date(`${date}T23:59:59.999Z`);
  const matches = await Match.find({ kickoff: { $gte: from, $lte: to }, status: 'scheduled' })
    .sort({ kickoff: 1 })
    .limit(40)
    .populate('homeTeamId', 'name shortName')
    .populate('awayTeamId', 'name shortName')
    .populate('leagueId', 'name')
    .lean();

  if (matches.length < 2) throw new Error('At least two upcoming matches are required');

  const optionsByMatch = await loadMarketOptions(matches, date);
  const candidates = buildAiCandidates(matches, optionsByMatch);
  let aiPicks: MarketOption[] = [];
  let model = 'heuristic';

  try {
    const raw = await openAISelect(candidates);
    aiPicks = normalizeAiPicks(raw, matches, optionsByMatch, date);
    if (aiPicks.length) model = env.OPENAI_MODEL;
  } catch (e) {
    console.warn('Bet of Day AI fallback:', e);
  }

  const picks = completePicks(aiPicks, matches, optionsByMatch, date).slice(0, 2);
  if (picks.length < 2) throw new Error('Unable to select two Bet of the Day picks');
  if (aiPicks.length && picks.some((pick) => !aiPicks.some((aiPick) => aiPick.matchId === pick.matchId && aiPick.prediction === pick.prediction))) {
    model = `${model}+heuristic`;
  }

  await BetOfDay.deleteMany({ date, status: { $in: ['draft', 'approved', 'published'] } });
  const docs = [];
  for (const pick of picks) {
    docs.push(await BetOfDay.create({
      date,
      matchId: pick.matchId,
      prediction: pick.prediction,
      odds: pick.odds,
      confidence: pick.confidence,
      risk: pick.risk,
      analysis: pick.analysis,
      model,
      status: 'published'
    }));
  }
  return docs;
}
