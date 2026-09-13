import { providerConfig } from '../config/providers';

async function requestJson(url: string) {
  const c = providerConfig().sportmonks;

  if (!c.apiKey) {
    throw new Error(
      "Sportmonks API key is missing. Please set FOOTBALL_API_KEY in .env"
    );
  }

  const separator = url.includes("?") ? "&" : "?";
  const requestUrl =
    `${url}${separator}api_token=${encodeURIComponent(c.apiKey)}`;

  const r = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });

  const body = await r.json();

  if (!r.ok) {
    throw new Error(
      body?.message ||
      body?.error ||
      `Sportmonks request failed with HTTP ${r.status}`
    );
  }

  return body;
}

function requireToken() { const c = providerConfig().sportmonks; if (!c.apiKey) throw new Error('Sportmonks is not configured. Set FOOTBALL_API_KEY in bratips-backend/.env.'); return c; }
function url(path: string, params: Record<string,string|undefined> = {}) { const c=requireToken(); const u=new URL(`${c.baseUrl}${path}`); Object.entries(params).forEach(([k,v])=>v!==undefined&&u.searchParams.set(k,v)); return u.toString(); }

export async function fetchLiveFootball() {
  requireToken();
  return requestJson(url('/livescores/inplay', { include:'participants;scores;events.type;periods;league;venue' }));
}
export async function fetchFixtures(date: string) {
  requireToken();
  return requestJson(url(`/fixtures/date/${encodeURIComponent(date)}`, { include:'participants;scores;events.type;lineups.player;statistics.type;xgfixture.type;predictions.type;league;venue' }));
}
export async function fetchFixture(fixtureId: string) {
  requireToken();
  return requestJson(url(`/fixtures/${encodeURIComponent(fixtureId)}`, { include:'participants;scores;events.type;lineups.player;statistics.type;xgfixture.type;predictions.type;league;venue' }));
}
export async function fetchOdds(mode:'pre-match'|'inplay'='pre-match') {
  requireToken();
  return requestJson(url(`/odds/${mode}`, { include:'market;bookmaker;fixture' }));
}
export async function fetchFixtureOdds(fixtureId:string, mode:'pre-match'|'inplay'='pre-match') {
  requireToken();
  return requestJson(url(`/odds/${mode}/fixtures/${encodeURIComponent(fixtureId)}`, { include:'market;bookmaker;fixture' }));
}
export async function fetchXGoals(fixtureId:string) {
  requireToken();
  return requestJson(url(`/fixtures/${encodeURIComponent(fixtureId)}`, { include:'xgfixture.type;lineups.xGLineup.type;participants;scores' }));
}

export async function syncFixtures(fixtures:any[]) {
  const { League } = await import('../models/League'); const { Team } = await import('../models/Team'); const { Match } = await import('../models/Match'); const { Season } = await import('../models/Season');
  let upserted=0;
  for (const f of fixtures) {
    const participants = Array.isArray(f.participants) ? f.participants : [];
    const home = participants.find((p:any)=>p.meta?.location==='home') || participants[0];
    const away = participants.find((p:any)=>p.meta?.location==='away') || participants[1];
    const league = await League.findOneAndUpdate({externalId:String(f.league_id ?? f.league?.id ?? '')},{externalId:String(f.league_id ?? f.league?.id ?? ''),name:f.league?.name||`League ${f.league_id}`,country:f.league?.country?.name||f.league?.country||'Unknown',logo:f.league?.image_path||'',active:true},{upsert:true,new:true,setDefaultsOnInsert:true});
    const seasonExternalId = f.season_id ?? f.season?.id;
    const season = seasonExternalId ? await Season.findOneAndUpdate({leagueId:league!._id,externalId:String(seasonExternalId)},{leagueId:league!._id,externalId:String(seasonExternalId),name:f.season?.name||`Season ${seasonExternalId}`,active:true},{upsert:true,new:true,setDefaultsOnInsert:true}) : null;
    const saveTeam=async(p:any)=>Team.findOneAndUpdate({externalId:String(p?.id ?? '')},{externalId:String(p?.id ?? ''),name:p?.name||'Unknown',shortName:p?.short_code||'',logo:p?.image_path||'',active:true},{upsert:true,new:true,setDefaultsOnInsert:true});
    const homeTeam=await saveTeam(home), awayTeam=await saveTeam(away);
    const scores=Array.isArray(f.scores)?f.scores:[]; const currentScores=scores.filter((s:any)=>s.description==='CURRENT'); const scoreFor=(participantId:any)=>{const x=currentScores.find((s:any)=>String(s.participant_id)===String(participantId)); return Number(x?.score?.goals ?? 0)};
    const state=f.state?.developer_name||f.state?.short_name||''; const status=/LIVE|INPLAY|HALFTIME|1ST_HALF|2ND_HALF/i.test(state)?'live':/FT|FINISHED/i.test(state)?'finished':/POSTPONED/i.test(state)?'postponed':/CANCELLED/i.test(state)?'cancelled':'scheduled';
    await Match.findOneAndUpdate({externalId:String(f.id)},{externalId:String(f.id),leagueId:league!._id,seasonId:season?._id,homeTeamId:homeTeam!._id,awayTeamId:awayTeam!._id,kickoff:new Date(f.starting_at),status,homeScore:scoreFor(home?.id),awayScore:scoreFor(away?.id),venue:{name:f.venue?.name,city:f.venue?.city}},{upsert:true,new:true,setDefaultsOnInsert:true});
    upserted++;
  }
  return upserted;
}