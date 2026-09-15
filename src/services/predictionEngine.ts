import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { OddsSnapshot } from '../models/OddsSnapshot';
import { User } from '../models/User';
import { fetchFixtures, fetchFixtureValueBets } from './providerService';

export type Horizon = 'daily' | 'weekly';

type TeamStats = { games:number; scored:number; conceded:number; homeGames:number; homeScored:number; homeConceded:number; awayGames:number; awayScored:number; awayConceded:number };
type EloMap = Map<string, number>;
type Candidate = { match:any; market:string; odds:number; probability:number; implied:number; value:number; confidence:number; premium:boolean; modelAgreement:number; analysis:string; modelScores:Record<string,number> };

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const round=(v:number,d=2)=>Number(v.toFixed(d));
const sigmoid=(x:number)=>1/(1+Math.exp(-x));
const poisson=(lambda:number,k:number)=>Math.exp(-lambda)*Math.pow(lambda,k)/factorial(k);
const factorial = (n: number): number => n <= 1 ? 1 : n * factorial(n - 1);

function result(match:any){
  if(match.homeScore>match.awayScore)return 1;
  if(match.homeScore<match.awayScore)return -1;
  return 0;
}

async function buildHistoricalState(until:Date){
  const rows:any[]=await Match.find({status:'finished',kickoff:{$lt:until}}).sort({kickoff:1}).limit(15000).select('homeTeamId awayTeamId homeScore awayScore kickoff leagueId').lean();
  const stats=new Map<string,TeamStats>();
  const elo:EloMap=new Map();
  const get=(id:string)=>{if(!stats.has(id))stats.set(id,{games:0,scored:0,conceded:0,homeGames:0,homeScored:0,homeConceded:0,awayGames:0,awayScored:0,awayConceded:0});return stats.get(id)!};
  const getElo=(id:string)=>elo.get(id)??1500;
  for(const m of rows){
    const h=String(m.homeTeamId),a=String(m.awayTeamId),hs=Number(m.homeScore||0),as=Number(m.awayScore||0);
    const sh=get(h),sa=get(a); sh.games++;sa.games++;sh.scored+=hs;sh.conceded+=as;sa.scored+=as;sa.conceded+=hs;sh.homeGames++;sh.homeScored+=hs;sh.homeConceded+=as;sa.awayGames++;sa.awayScored+=as;sa.awayConceded+=hs;
    const eh=getElo(h),ea=getElo(a), expected=sigmoid((eh+55-ea)/400), actual=hs>as?1:hs<as?0:.5, k=20;
    elo.set(h,eh+k*(actual-expected)); elo.set(a,ea+k*((1-actual)-((1-expected))));
  }
  return {stats,elo};
}

function leagueAverages(rows:any[]){
  let hg=0,ag=0,n=0; for(const m of rows){hg+=Number(m.homeScore||0);ag+=Number(m.awayScore||0);n++;}
  return {home:n?hg/n:1.45,away:n?ag/n:1.15,total:n?(hg+ag)/n:2.6};
}

function expectedGoals(match:any, stats:Map<string,TeamStats>, league:any){
  const h=stats.get(String(match.homeTeamId?._id||match.homeTeamId)); const a=stats.get(String(match.awayTeamId?._id||match.awayTeamId));
  const homeAttack=h?.homeGames? h.homeScored/h.homeGames : league.home;
  const homeDef=h?.homeGames? h.homeConceded/h.homeGames : league.away;
  const awayAttack=a?.awayGames? a.awayScored/a.awayGames : league.away;
  const awayDef=a?.awayGames? a.awayConceded/a.awayGames : league.home;
  const lh=clamp((homeAttack*0.62 + awayDef*0.38),0.25,3.6);
  const la=clamp((awayAttack*0.62 + homeDef*0.38),0.2,3.2);
  return {home:lh,away:la};
}

function poissonMarkets(lh:number,la:number){
  let home=0,draw=0,away=0,over25=0,btts=0;
  for(let h=0;h<=8;h++)for(let a=0;a<=8;a++){const p=poisson(lh,h)*poisson(la,a); if(h>a)home+=p; else if(h===a)draw+=p; else away+=p; if(h+a>2.5)over25+=p; if(h>0&&a>0)btts+=p;}
  return {home,draw,away,over25,under25:1-over25,btts,noBtts:1-btts};
}

function labelType(label:string){
  const t=label.toLowerCase().replace(/[_-]/g,' ');
  if(/home win|^1$|home to win/.test(t))return 'home';
  if(/away win|^2$|away to win/.test(t))return 'away';
  if(/^x$|draw|tie/.test(t))return 'draw';
  if(/over\s*2\.5|over 2 5/.test(t))return 'over25';
  if(/under\s*2\.5|under 2 5/.test(t))return 'under25';
  if(/both.*score|btts/.test(t) && !/no/.test(t))return 'btts';
  if(/both.*score.*no|btts.*no/.test(t))return 'noBtts';
  if(/double chance.*1x|\b1x\b/.test(t))return '1x';
  if(/double chance.*x2|\bx2\b/.test(t))return 'x2';
  if(/double chance.*12|\b12\b/.test(t))return '12';
  return null;
}

function probabilityFor(type:string,m:any,mg:any){
  if(type==='home')return mg.home; if(type==='draw')return mg.draw; if(type==='away')return mg.away; if(type==='over25')return mg.over25; if(type==='under25')return mg.under25; if(type==='btts')return mg.btts; if(type==='noBtts')return mg.noBtts; if(type==='1x')return mg.home+mg.draw; if(type==='x2')return mg.away+mg.draw; if(type==='12')return mg.home+mg.away; return 0;
}

function eloProbabilities(match:any,elo:EloMap){
  const eh=elo.get(String(match.homeTeamId?._id||match.homeTeamId))??1500, ea=elo.get(String(match.awayTeamId?._id||match.awayTeamId))??1500;
  const pHome=sigmoid((eh+55-ea)/400); const draw=clamp(0.27-Math.abs(eh-ea)/6000,0.18,0.30); const home=(1-draw)*pHome, away=(1-draw)*(1-pHome); return {home,draw,away};
}

function marketProbability(label:string, oddsRows:any[], type:string){
  const peers=oddsRows.filter(o=>labelType(String(o.label))===type || (type==='home'&&labelType(String(o.label))==='home') || (type==='draw'&&labelType(String(o.label))==='draw') || (type==='away'&&labelType(String(o.label))==='away'));
  return peers.length ? 1/Math.max(1.01,Number(peers[0].value)) : null;
}

function sportmonksPrior(raw:any, type:string){
  const rows=Array.isArray(raw?.predictions)?raw.predictions:[];
  const normalise=(v:any)=>{const n=Number(v);return Number.isFinite(n)?(n>1?n/100:n):null};
  for(const row of rows){
    const name=String(row?.type?.name||row?.type?.developer_name||row?.type?.code||'').toLowerCase();
    const p=row?.predictions||{};
    if(type==='home' && /fulltime result probability/.test(name) && p.home!=null)return normalise(p.home);
    if(type==='draw' && /fulltime result probability/.test(name) && p.draw!=null)return normalise(p.draw);
    if(type==='away' && /fulltime result probability/.test(name) && p.away!=null)return normalise(p.away);
    if(type==='btts' && /both teams to score/.test(name) && p.yes!=null)return normalise(p.yes);
    if(type==='noBtts' && /both teams to score/.test(name) && p.no!=null)return normalise(p.no);
    if(type==='over25' && /over\/under 2\.5/.test(name)){ if(p.over!=null)return normalise(p.over); if(p.yes!=null)return normalise(p.yes); }
    if(type==='under25' && /over\/under 2\.5/.test(name)){ if(p.under!=null)return normalise(p.under); if(p.no!=null)return normalise(p.no); }
    if(type==='1x' && /double chance/.test(name) && p['1X']!=null)return normalise(p['1X']);
    if(type==='x2' && /double chance/.test(name) && p['X2']!=null)return normalise(p['X2']);
    if(type==='12' && /double chance/.test(name) && p['12']!=null)return normalise(p['12']);
  }
  return null;
}

function valueBetFor(raw:any,type:string){
  const rows=Array.isArray(raw?.data)?raw.data:[];
  const betFor=(t:string)=>t==='home'?'1':t==='draw'?'X':t==='away'?'2':null;
  const target=betFor(type); if(!target)return null;
  const row=rows.find((x:any)=>String(x?.predictions?.bet||'').toUpperCase()===target);
  if(!row)return null;
  return {isValue:Boolean(row.predictions?.is_value),odd:Number(row.predictions?.odd||0),fairOdd:Number(row.predictions?.fair_odd||0)};
}

async function getOdds(matchId:any){
  const rows=await OddsSnapshot.find({matchId,mode:'pre-match'}).sort({recordedAt:-1}).limit(300).lean();
  const seen=new Set<string>(); return rows.filter((o:any)=>{const k=`${o.marketId||0}:${o.label}`;if(seen.has(k))return false;seen.add(k);return Number(o.value)>1;});
}

function chooseCandidates(match:any, odds:any[], mg:any, ep:any, sportRaw:any, valueBets:any):Candidate[]{
  const types=['home','draw','away','1x','x2','12','over25','under25','btts','noBtts'];
  const byType=new Map<string,any>();
  for(const o of odds){const t=labelType(String(o.label));if(t&&!byType.has(t))byType.set(t,o);}
  const out:Candidate[]=[];
  for(const type of types){const odd=byType.get(type); if(!odd)continue; const base=probabilityFor(type,match,mg); const eloBase=type==='home'?ep.home:type==='draw'?ep.draw:type==='away'?ep.away:type==='1x'?ep.home+ep.draw:type==='x2'?ep.away+ep.draw:type==='12'?ep.home+ep.away:base; const sm=sportmonksPrior(sportRaw,type); const market=1/Number(odd.value); const components=[base,eloBase,sm,market].filter((x):x is number=>x!==null&&Number.isFinite(x)); const weights=sm!==null?[0.45,0.2,0.2,0.15]:[0.55,0.25,0,0.2]; let prob=base*weights[0]+eloBase*weights[1]+(sm??0)*weights[2]+market*weights[3]; prob=clamp(prob,0.02,0.98); const value=prob*Number(odd.value)-1; const agreement=1-Math.min(1,Math.abs(base-eloBase)*2.2); const confidence=clamp(50+prob*35+agreement*12+(value>0.08?5:0),50,95); const vb=valueBetFor(valueBets,type); const premium=(vb?.isValue===true && Number(odd.value)>=2.0 && prob>=0.48) || (Number(odd.value)>=2.0 && prob>=0.48 && value>=0.10 && agreement>=0.72);
    const marketNames:any={home:'Home Win',draw:'Draw',away:'Away Win','1x':'Double Chance 1X','x2':'Double Chance X2','12':'Double Chance 12',over25:'Over 2.5 Goals',under25:'Under 2.5 Goals',btts:'Both Teams To Score',noBtts:'BTTS - No'};
    out.push({match,market:marketNames[type],odds:Number(odd.value),probability:prob,implied:market,value,confidence,premium,modelAgreement:agreement,analysis:`Ensemble: Poisson ${round(base*100,1)}%, Elo ${round(eloBase*100,1)}%${sm!==null?`, Sportmonks ${round(sm*100,1)}%`:''}. Estimated value ${round(value*100,1)}%.`,modelScores:{poisson:base,elo:eloBase,sportmonks:sm??0,market}});
  }
  return out.sort((a,b)=>b.value-a.value || b.probability-a.probability);
}

async function generateForHorizon(horizon:Horizon, start:Date, end:Date){
  const {stats,elo}=await buildHistoricalState(start);
  const historical:any[]=await Match.find({status:'finished',kickoff:{$lt:start}}).sort({kickoff:-1}).limit(10000).select('homeScore awayScore').lean();
  const league=leagueAverages(historical);
  const matches:any[]=await Match.find({status:'scheduled',kickoff:{$gte:start,$lt:end}}).sort({kickoff:1}).populate('homeTeamId','name shortName logo').populate('awayTeamId','name shortName logo').populate('leagueId','name logo').lean();
  let created=0,premium=0,publicCount=0;
  const providerCache=new Map<string,any>();
  const valueBetCache=new Map<string,any>();
  for(const match of matches){
    const odds=await getOdds(match._id);
    let raw=null; const dayKey=match.kickoff.toISOString().slice(0,10); if(match.externalId){ try{ if(!providerCache.has(dayKey)) providerCache.set(dayKey, await fetchFixtures(dayKey)); const payload=providerCache.get(dayKey); const row=(payload?.data||[]).find((x:any)=>String(x.id)===String(match.externalId)); raw=row||null;}catch{} }
    let valueBets=null; if(match.externalId){ try{ const key=String(match.externalId); if(!valueBetCache.has(key)) valueBetCache.set(key, await fetchFixtureValueBets(key)); valueBets=valueBetCache.get(key); }catch{} }
    const eg=expectedGoals(match,stats,league); const pm=poissonMarkets(eg.home,eg.away); const ep=eloProbabilities(match,elo); let candidates=chooseCandidates(match,odds,pm,ep,raw,valueBets);
    if(!candidates.length){ const fallbackType=pm.home>=pm.away && pm.home>=pm.draw ? 'Home Win' : pm.away>=pm.home && pm.away>=pm.draw ? 'Away Win' : 'Double Chance 1X'; const fp=fallbackType==='Home Win'?pm.home:fallbackType==='Away Win'?pm.away:pm.home+pm.draw; const fair=Math.max(1.01,1/fp); candidates=[{match,market:fallbackType,odds:round(fair,2),probability:fp,implied:1/fair,value:0,confidence:round(50+fp*35,1),premium:false,modelAgreement:0.8,analysis:'Model-only selection. No bookmaker price was available when this prediction was generated.',modelScores:{poisson:fp,elo:fp,sportmonks:0,market:1/fair}}]; }
    const best=candidates[0]; const bestPublic=[...candidates].sort((a,b)=>(b.probability+(b.value>0?0.1:0))-(a.probability+(a.value>0?0.1:0)))[0];
    const selections=[bestPublic]; if(best.premium && best.market!==bestPublic.market) selections.push(best); else { const p=candidates.find(x=>x.premium&&x.market!==bestPublic.market); if(p)selections.push(p); }
    for(const c of selections.slice(0,2)){
      const existing=await Prediction.findOne({matchId:match._id,systemGenerated:true,source:'ensemble',prediction:c.market,status:'published',horizon});
      if(existing)continue;
      await Prediction.create({oddsSource:odds.length?'bookmaker':'model-fair',matchId:match._id,fixture:`${match.homeTeamId?.name||'Home'} vs ${match.awayTeamId?.name||'Away'}`,league:match.leagueId?.name||'',prediction:c.market,odds:c.odds,isPremium:c.premium,confidence:round(c.confidence,1),analysis:c.analysis,status:'published',publishedAt:new Date(),systemGenerated:true,source:'ensemble',modelVersion:'ensemble-v1-poisson-elo-sportmonks-market',modelScore:round(c.probability*100,2),expectedValue:round(c.value,4),modelAgreement:round(c.modelAgreement,4),horizon});
      created++; if(c.premium)premium++; else publicCount++;
    }
  }
  return {horizon,matches:matches.length,created,premium,publicCount};
}

export async function generateDailyPredictions(date=new Date().toISOString().slice(0,10)){
  const start=new Date(`${date}T00:00:00.000Z`),end=new Date(start);end.setUTCDate(end.getUTCDate()+1); return generateForHorizon('daily',start,end);
}
export async function generateWeeklyPredictions(date=new Date().toISOString().slice(0,10)){
  const start=new Date(`${date}T00:00:00.000Z`),end=new Date(start);end.setUTCDate(end.getUTCDate()+7); return generateForHorizon('weekly',start,end);
}
