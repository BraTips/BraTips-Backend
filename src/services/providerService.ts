import { providerConfig } from '../config/providers';
import { OddsSnapshot } from '../models/OddsSnapshot';

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
  return requestJson(url(`/fixtures/date/${encodeURIComponent(date)}`, { include:'participants;scores;state;events.type;lineups.player;statistics.type;xgfixture.type;predictions.type;league;venue' }));
}
export async function fetchFixture(fixtureId: string) {
  requireToken();
  return requestJson(url(`/fixtures/${encodeURIComponent(fixtureId)}`, { include:'participants;scores;state;events.type;lineups.player;statistics.type;xgfixture.type;predictions.type;league;venue' }));
}
export async function fetchOdds(mode:'pre-match'|'inplay'='pre-match') {
  requireToken();
  return requestJson(url(`/odds/${mode}`, { include:'market;bookmaker;fixture' }));
}
export async function fetchFixtureOdds(fixtureId:string, mode:'pre-match'|'inplay'='pre-match') {
  requireToken();
  return requestJson(url(`/odds/${mode}/fixtures/${encodeURIComponent(fixtureId)}`, { include:'market;bookmaker;fixture' }));
}

export async function fetchFixtureValueBets(fixtureId:string) {
  requireToken();
  return requestJson(url(`/predictions/value-bets/fixtures/${encodeURIComponent(fixtureId)}`, { include:'type;fixture' }));
}

export async function fetchHeadToHead(team1ExternalId:string, team2ExternalId:string) {
  requireToken();
  return requestJson(url(`/fixtures/head-to-head/${encodeURIComponent(team1ExternalId)}/${encodeURIComponent(team2ExternalId)}`, { include:'participants;scores;league;venue;state' }));
}

export async function fetchStandingsBySeason(seasonExternalId:string) {
  requireToken();
  return requestJson(url(`/standings/seasons/${encodeURIComponent(seasonExternalId)}`, { include:'participant;details.type' }));
}

export async function fetchTeamRecentFixtures(teamExternalId:string, days=90) {
  requireToken();
  const end=new Date();
  const start=new Date(end.getTime()-days*24*60*60*1000);
  const iso=(d:Date)=>d.toISOString().slice(0,10);
  return requestJson(url(`/fixtures/between/date/${iso(start)}/${iso(end)}/${encodeURIComponent(teamExternalId)}`, { include:'participants;scores;league;state' }));
}

export async function fetchXGoals(fixtureId:string) {
  requireToken();
  return requestJson(url(`/fixtures/${encodeURIComponent(fixtureId)}`, { include:'xgfixture.type;lineups.xGLineup.type;participants;scores' }));
}

function parseOddDate(value:any){
  if(!value) return undefined;
  const d=new Date(value);
  return Number.isNaN(d.getTime())?undefined:d;
}

function flattenOdds(payload:any){
  const data=Array.isArray(payload?.data)?payload.data:[];
  return data.map((o:any)=>({
    fixtureId:String(o.fixture_id ?? o.fixture?.id ?? ''),
    bookmakerId:Number(o.bookmaker_id ?? o.bookmaker?.id) || undefined,
    bookmakerName:o.bookmaker?.name || o.bookmaker?.title || '',
    marketId:Number(o.market_id ?? o.market?.id) || undefined,
    marketName:o.market?.name || o.market_description || '',
    label:String(o.label ?? o.name ?? ''),
    value:Number(o.value),
    bookmakerUpdatedAt:parseOddDate(o.latest_bookmaker_update || o.last_update || o.updated_at)
  })).filter((x:any)=>x.fixtureId && x.label && Number.isFinite(x.value) && x.value>0);
}

export async function syncFixtureOdds(match:any, mode:'pre-match'|'inplay'='pre-match') {
  if(!match?.externalId) return 0;
  const payload=await fetchFixtureOdds(String(match.externalId),mode);
  const odds=flattenOdds(payload);
  let saved=0;
  for(const odd of odds){
    const previous=await OddsSnapshot.findOne({matchId:match._id,bookmakerId:odd.bookmakerId,marketId:odd.marketId,label:odd.label,mode}).sort({recordedAt:-1});
    const changed=!previous || previous.value!==odd.value;
    if(!changed) continue;
    const movementPct=previous?.value ? Number(((odd.value-previous.value)/previous.value*100).toFixed(2)) : undefined;
    await OddsSnapshot.create({matchId:match._id,fixtureExternalId:odd.fixtureId,bookmakerId:odd.bookmakerId,bookmakerName:odd.bookmakerName,marketId:odd.marketId,marketName:odd.marketName,label:odd.label,value:odd.value,previousValue:previous?.value,movementPct,mode,bookmakerUpdatedAt:odd.bookmakerUpdatedAt,recordedAt:new Date()});
    saved++;
  }
  return saved;
}

export async function syncUpcomingOdds(limit=80){
  const { Match } = await import('../models/Match');
  const now=new Date(); const end=new Date(now.getTime()+72*60*60*1000);
  const matches=await Match.find({status:'scheduled',kickoff:{$gte:now,$lte:end},externalId:{$exists:true,$ne:''}}).sort({kickoff:1}).limit(limit);
  let saved=0;
  for(const match of matches){
    try{ saved+=await syncFixtureOdds(match,'pre-match'); }catch(e){ console.error('Odds sync failed',String(match.externalId),e); }
  }
  return {matches:matches.length,saved};
}

export { flattenOdds };

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
    const saveTeam=async(p:any)=>Team.findOneAndUpdate({externalId:String(p?.id ?? '')},{externalId:String(p?.id ?? ''),name:p?.name||'Unknown',shortName:p?.short_code||'',logo:p?.image_path || p?.image?.path || p?.logo || '',active:true},{upsert:true,new:true,setDefaultsOnInsert:true});
    const homeTeam=await saveTeam(home), awayTeam=await saveTeam(away);
    const scores=Array.isArray(f.scores)?f.scores:[];
    const scoreFor=(participantId:any)=>{
      const candidates=scores.filter((s:any)=>String(s.participant_id)===String(participantId));
      const preferred=candidates.find((s:any)=>String(s.description||'').toUpperCase()==='CURRENT')
        || candidates.find((s:any)=>/2ND|SECOND|1ST|FIRST|HALF|FULL|FINAL|CURRENT/i.test(String(s.description||'')))
        || candidates[0];
      return Number(preferred?.score?.goals ?? preferred?.goals ?? 0);
    };
    const state=[f.state?.developer_name,f.state?.short_name,f.state?.name,f.state?.description].filter(Boolean).join(' ');
    const stateId=Number(f.state?.id);
    const hasResult=Boolean(f.result_info||f.finished_at||f.final_score) || scores.length>0;
    const status=/LIVE|INPLAY|HALFTIME|1ST_HALF|2ND_HALF|FIRST_HALF|SECOND_HALF|BREAK/i.test(state)
      ? 'live'
      : /POSTPONED/i.test(state)
        ? 'postponed'
        : /CANCELLED|CANCELED/i.test(state)
          ? 'cancelled'
          : /FT|FINISHED|AFTER_EXTRA_TIME|AFTER_PENALTIES|AWARDED|FT_PEN|ENDED|COMPLETE/i.test(state)
            ? 'finished'
            : (stateId===5 || stateId===6 || stateId===7 || stateId===8) && hasResult
              ? 'finished'
              : 'scheduled';
    await Match.findOneAndUpdate({externalId:String(f.id)},{externalId:String(f.id),leagueId:league!._id,seasonId:season?._id,homeTeamId:homeTeam!._id,awayTeamId:awayTeam!._id,kickoff:new Date(f.starting_at),status,homeScore:scoreFor(home?.id),awayScore:scoreFor(away?.id),venue:{name:f.venue?.name,city:f.venue?.city}},{upsert:true,new:true,setDefaultsOnInsert:true});
    upserted++;
  }
  return upserted;
}