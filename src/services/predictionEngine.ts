import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { OddsSnapshot } from '../models/OddsSnapshot';
import { fetchFixtures, fetchFixtureValueBets } from './providerService';

export type Horizon = 'daily' | 'weekly';

type TeamStats = { games:number; scored:number; conceded:number; homeGames:number; homeScored:number; homeConceded:number; awayGames:number; awayScored:number; awayConceded:number };
type EloMap = Map<string, number>;
type OddsSource = 'bookmaker'|'model-fair';
type ScoreCell = { home:number; away:number; probability:number };
type Candidate = { match:any; market:string; marketType:string; odds:number; oddsSource:OddsSource; probability:number; implied:number; value:number; confidence:number; premium:boolean; modelAgreement:number; analysis:string; modelScores:Record<string,number> };

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const round=(v:number,d=2)=>Number(v.toFixed(d));
const sigmoid=(x:number)=>1/(1+Math.exp(-x));
const poisson=(lambda:number,k:number)=>Math.exp(-lambda)*Math.pow(lambda,k)/factorial(k);
const factorial = (n: number): number => n <= 1 ? 1 : n * factorial(n - 1);
const TOTAL_LINES=[0.5,1.5,2.5,3.5,4.5,5.5];
const TEAM_LINES=[0.5,1.5,2.5,3.5];
const COMMON_SCORES:Array<[number,number]>=[[0,0],[1,0],[0,1],[1,1],[2,0],[0,2],[2,1],[1,2],[2,2],[3,0],[0,3],[3,1],[1,3],[3,2],[2,3],[3,3],[4,0],[0,4],[4,1],[1,4]];
const CORE_MARKETS=['home','draw','away','1x','x2','12','dnbHome','dnbAway','btts','noBtts','homeScore','awayScore','homeCleanSheet','awayCleanSheet'];

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

function scoreGrid(lh:number,la:number){
  const scores:ScoreCell[]=[];
  for(let h=0;h<=8;h++)for(let a=0;a<=8;a++)scores.push({home:h,away:a,probability:poisson(lh,h)*poisson(la,a)});
  return scores;
}

function sumScores(scores:ScoreCell[], predicate:(score:ScoreCell)=>boolean){
  return scores.reduce((n,score)=>n+(predicate(score)?score.probability:0),0);
}

function poissonMarkets(lh:number,la:number){
  const scores=scoreGrid(lh,la);
  const home=sumScores(scores,x=>x.home>x.away),draw=sumScores(scores,x=>x.home===x.away),away=sumScores(scores,x=>x.home<x.away);
  const over25=sumScores(scores,x=>x.home+x.away>2.5),btts=sumScores(scores,x=>x.home>0&&x.away>0);
  return {home,draw,away,over25,under25:1-over25,btts,noBtts:1-btts,scores,lh,la};
}

function normaliseText(value:string){
  return value.toLowerCase().replace(/[\u2013\u2014]/g,'-').replace(/[_/]/g,' ').replace(/\s*\+\s*/g,' + ').replace(/\s+/g,' ').trim();
}

function lineKey(value:number){
  return Number(value).toFixed(1);
}

function parseLine(text:string){
  const match=text.match(/\b(over|under)\s*(\d+(?:\.\d+)?)\b/);
  return match ? {side:match[1],line:Number(match[2])} : null;
}

function labelType(input:any){
  const label=typeof input==='string'?input:String(input?.label||'');
  const market=typeof input==='string'?'':String(input?.marketName||'');
  const labelOnly=normaliseText(label);
  const text=normaliseText(`${market} ${label}`);
  const isUnsupported=/corner|card|booking|player|shot|assist|offside|throw in|foul|save/.test(text)
    || /half time|half-time|1st half|first half|ht ft|first goal|last goal|\b\d{1,2}-\d{1,2}\s*minutes?\b/.test(text);
  if(isUnsupported) return null;

  if(/correct score|exact score/.test(text)){
    const score=text.match(/\b(\d+)\s*[-:]\s*(\d+)\b/);
    if(score) return `cs:${Number(score[1])}-${Number(score[2])}`;
  }

  if(/draw no bet|\bdnb\b/.test(text)){
    if(/home|team 1|\b1\b/.test(text)) return 'dnbHome';
    if(/away|team 2|\b2\b/.test(text)) return 'dnbAway';
  }

  if(/clean sheet/.test(text)){
    if(/home|team 1/.test(text) && !/\bno\b/.test(labelOnly)) return 'homeCleanSheet';
    if(/away|team 2/.test(text) && !/\bno\b/.test(labelOnly)) return 'awayCleanSheet';
  }

  if(/both teams.*score|btts/.test(text)){
    const line=parseLine(text);
    if(line?.side==='over') return `bttsOver:${lineKey(line.line)}`;
    if(line?.side==='under') return `bttsUnder:${lineKey(line.line)}`;
    if(/home win|home to win|\b1\b/.test(text)) return 'bttsHome';
    if(/away win|away to win|\b2\b/.test(text)) return 'bttsAway';
    if(/\bdraw\b|\bx\b/.test(text)) return 'bttsDraw';
    if(/\bno\b/.test(labelOnly) || /\bno\b/.test(text)) return 'noBtts';
    return 'btts';
  }

  const teamLine=parseLine(text);
  if(teamLine && (/team goals|home goals|away goals|home team total|away team total/.test(text))){
    if(/home|team 1/.test(text)) return `home${teamLine.side==='over'?'Over':'Under'}:${lineKey(teamLine.line)}`;
    if(/away|team 2/.test(text)) return `away${teamLine.side==='over'?'Over':'Under'}:${lineKey(teamLine.line)}`;
  }

  if(/home team to score|home to score/.test(text) && !/first|last/.test(text)) return 'homeScore';
  if(/away team to score|away to score/.test(text) && !/first|last/.test(text)) return 'awayScore';

  if(/double chance/.test(text) || ['1x','x2','12'].includes(labelOnly)){
    if(/\b1x\b/.test(text)||labelOnly==='1x')return '1x';
    if(/\bx2\b/.test(text)||labelOnly==='x2')return 'x2';
    if(/\b12\b/.test(text)||labelOnly==='12')return '12';
  }

  const totalLine=parseLine(text);
  if(totalLine && !/team/.test(text)) return `${totalLine.side}:${lineKey(totalLine.line)}`;

  if(labelOnly==='1' || /home win|home to win/.test(text))return 'home';
  if(labelOnly==='2' || /away win|away to win/.test(text))return 'away';
  if(labelOnly==='x' || /\bdraw\b|\btie\b/.test(text))return 'draw';
  return null;
}

function scoreProbability(mg:any, predicate:(score:ScoreCell)=>boolean){
  return sumScores(Array.isArray(mg.scores)?mg.scores:[],predicate);
}

function probabilityFor(type:string, mg:any){
  if(type==='home')return mg.home; if(type==='draw')return mg.draw; if(type==='away')return mg.away;
  if(type==='1x')return mg.home+mg.draw; if(type==='x2')return mg.away+mg.draw; if(type==='12')return mg.home+mg.away;
  if(type==='dnbHome')return mg.home/(mg.home+mg.away||1); if(type==='dnbAway')return mg.away/(mg.home+mg.away||1);
  if(type==='btts')return mg.btts; if(type==='noBtts')return mg.noBtts;
  if(type==='homeScore')return scoreProbability(mg,x=>x.home>0); if(type==='awayScore')return scoreProbability(mg,x=>x.away>0);
  if(type==='homeCleanSheet')return scoreProbability(mg,x=>x.away===0); if(type==='awayCleanSheet')return scoreProbability(mg,x=>x.home===0);
  const total=type.match(/^(over|under):(\d+(?:\.\d+)?)$/); if(total){const line=Number(total[2]);return scoreProbability(mg,x=>total[1]==='over'?x.home+x.away>line:x.home+x.away<line);}
  const team=type.match(/^(home|away)(Over|Under):(\d+(?:\.\d+)?)$/); if(team){const side=team[1],line=Number(team[3]),over=team[2]==='Over';return scoreProbability(mg,x=>over?(side==='home'?x.home:x.away)>line:(side==='home'?x.home:x.away)<line);}
  const bttsTotal=type.match(/^btts(Over|Under):(\d+(?:\.\d+)?)$/); if(bttsTotal){const line=Number(bttsTotal[2]),over=bttsTotal[1]==='Over';return scoreProbability(mg,x=>x.home>0&&x.away>0&&(over?x.home+x.away>line:x.home+x.away<line));}
  if(type==='bttsHome')return scoreProbability(mg,x=>x.home>x.away&&x.home>0&&x.away>0);
  if(type==='bttsDraw')return scoreProbability(mg,x=>x.home===x.away&&x.home>0&&x.away>0);
  if(type==='bttsAway')return scoreProbability(mg,x=>x.away>x.home&&x.home>0&&x.away>0);
  const cs=type.match(/^cs:(\d+)-(\d+)$/); if(cs){const h=Number(cs[1]),a=Number(cs[2]);return scoreProbability(mg,x=>x.home===h&&x.away===a);}
  return 0;
}

function eloProbabilities(match:any,elo:EloMap){
  const eh=elo.get(String(match.homeTeamId?._id||match.homeTeamId))??1500, ea=elo.get(String(match.awayTeamId?._id||match.awayTeamId))??1500;
  const pHome=sigmoid((eh+55-ea)/400); const draw=clamp(0.27-Math.abs(eh-ea)/6000,0.18,0.30); const home=(1-draw)*pHome, away=(1-draw)*(1-pHome); return {home,draw,away};
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
    if(type==='over:2.5' && /over\/under 2\.5/.test(name)){ if(p.over!=null)return normalise(p.over); if(p.yes!=null)return normalise(p.yes); }
    if(type==='under:2.5' && /over\/under 2\.5/.test(name)){ if(p.under!=null)return normalise(p.under); if(p.no!=null)return normalise(p.no); }
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

function typeLabel(type:string){
  if(type==='home') return 'Home Win';
  if(type==='draw') return 'Draw';
  if(type==='away') return 'Away Win';
  if(type==='1x') return 'Double Chance 1X';
  if(type==='x2') return 'Double Chance X2';
  if(type==='12') return 'Double Chance 12';
  if(type==='dnbHome') return 'Draw No Bet - Home';
  if(type==='dnbAway') return 'Draw No Bet - Away';
  if(type==='btts') return 'BTTS - Yes';
  if(type==='noBtts') return 'BTTS - No';
  if(type==='homeScore') return 'Home Team To Score';
  if(type==='awayScore') return 'Away Team To Score';
  if(type==='homeCleanSheet') return 'Home Clean Sheet';
  if(type==='awayCleanSheet') return 'Away Clean Sheet';
  if(type==='bttsHome') return 'BTTS + Home Win';
  if(type==='bttsDraw') return 'BTTS + Draw';
  if(type==='bttsAway') return 'BTTS + Away Win';
  const total=type.match(/^(over|under):(\d+(?:\.\d+)?)$/);
  if(total) return `${total[1]==='over'?'Over':'Under'} ${total[2]} Goals`;
  const team=type.match(/^(home|away)(Over|Under):(\d+(?:\.\d+)?)$/);
  if(team) return `${team[1]==='home'?'Home':'Away'} ${team[2]} ${team[3]} Goals`;
  const bttsTotal=type.match(/^btts(Over|Under):(\d+(?:\.\d+)?)$/);
  if(bttsTotal) return `BTTS + ${bttsTotal[1]} ${bttsTotal[2]} Goals`;
  const cs=type.match(/^cs:(\d+)-(\d+)$/);
  if(cs) return `Correct Score ${cs[1]}-${cs[2]}`;
  return type;
}

function catalogTypes(mg:any){
  const types=new Set<string>(CORE_MARKETS);
  for(const line of TOTAL_LINES){types.add(`over:${lineKey(line)}`);types.add(`under:${lineKey(line)}`);}
  for(const line of TEAM_LINES){
    types.add(`homeOver:${lineKey(line)}`);types.add(`homeUnder:${lineKey(line)}`);
    types.add(`awayOver:${lineKey(line)}`);types.add(`awayUnder:${lineKey(line)}`);
  }
  ['bttsHome','bttsDraw','bttsAway','bttsOver:2.5','bttsUnder:2.5'].forEach(x=>types.add(x));
  for(const [home,away] of COMMON_SCORES) types.add(`cs:${home}-${away}`);
  return [...types].filter((type)=>probabilityFor(type,mg)>0.025);
}

function fairOdds(probability:number, premium:boolean){
  const margin=premium ? 0.94 : 0.9;
  return round(clamp(margin/Math.max(probability,0.01),1.01,51),2);
}

function eloProbabilityFor(type:string, mg:any, ep:any){
  if(type==='home')return ep.home; if(type==='draw')return ep.draw; if(type==='away')return ep.away;
  if(type==='1x')return ep.home+ep.draw; if(type==='x2')return ep.away+ep.draw; if(type==='12')return ep.home+ep.away;
  if(type==='dnbHome')return ep.home/(ep.home+ep.away||1); if(type==='dnbAway')return ep.away/(ep.home+ep.away||1);
  return probabilityFor(type,mg);
}

function isAdvancedMarket(type:string){
  return !['home','draw','away','1x','x2','12','over:1.5','under:3.5','over:2.5','under:2.5','btts','noBtts'].includes(type);
}

function buildCandidate(match:any, type:string, odd:any|undefined, mg:any, ep:any, sportRaw:any, valueBets:any):Candidate|null{
  const base=probabilityFor(type,mg);
  if(!Number.isFinite(base)||base<=0.025) return null;
  const eloBase=eloProbabilityFor(type,mg,ep);
  const sm=sportmonksPrior(sportRaw,type);
  const oddsSource:OddsSource=odd?'bookmaker':'model-fair';
  const modelOnlyPremium=isAdvancedMarket(type) && (base>=0.42 || /^cs:/.test(type));
  const oddValue=odd ? Number(odd.value) : fairOdds(base,modelOnlyPremium);
  if(!Number.isFinite(oddValue)||oddValue<1.01) return null;
  if(oddsSource==='model-fair' && oddValue<1.18) return null;
  const market=1/oddValue;
  const weights=sm!==null?[0.5,0.2,0.15,0.15]:[0.62,0.23,0,0.15];
  let prob=base*weights[0]+eloBase*weights[1]+(sm??0)*weights[2]+market*weights[3];
  if(oddsSource==='model-fair') prob=base*0.72+eloBase*0.28;
  prob=clamp(prob,0.02,0.98);
  const value=oddsSource==='bookmaker' ? prob*oddValue-1 : 0;
  const agreement=clamp(1-Math.abs(base-eloBase)*2.2,0,1);
  const confidence=clamp(50+prob*35+agreement*10+(value>0.08?5:0)+(isAdvancedMarket(type)?2:0),50,95);
  const vb=valueBetFor(valueBets,type);
  const premium=Boolean(
    modelOnlyPremium
    || (vb?.isValue===true && oddValue>=1.7 && prob>=0.45)
    || (oddValue>=1.75 && prob>=0.48 && value>=0.04 && agreement>=0.65)
    || (isAdvancedMarket(type) && confidence>=66)
  );
  return {match,market:typeLabel(type),marketType:type,odds:oddValue,oddsSource,probability:prob,implied:market,value,confidence,premium,modelAgreement:agreement,analysis:`Ensemble: Poisson ${round(base*100,1)}%, Elo ${round(eloBase*100,1)}%${sm!==null?`, Sportmonks ${round(sm*100,1)}%`:''}${oddsSource==='bookmaker'?`, market ${round(market*100,1)}%`:''}. Estimated value ${round(value*100,1)}%.`,modelScores:{poisson:base,elo:eloBase,sportmonks:sm??0,market}};
}

function chooseCandidates(match:any, odds:any[], mg:any, ep:any, sportRaw:any, valueBets:any):Candidate[]{
  const byType=new Map<string,any>();
  for(const o of odds){const t=labelType(o);if(t&&!byType.has(t))byType.set(t,o);}
  const out:Candidate[]=[];
  const types=new Set([...catalogTypes(mg),...byType.keys()]);
  for(const type of types){
    const candidate=buildCandidate(match,type,byType.get(type),mg,ep,sportRaw,valueBets);
    if(candidate) out.push(candidate);
  }
  return out.sort((a,b)=>{
    const score=(x:Candidate)=>x.confidence+(x.value>0?x.value*18:0)+(x.premium?2:0)-(x.marketType.startsWith('cs:')?8:0);
    return score(b)-score(a) || b.probability-a.probability;
  });
}

function fallbackCandidate(match:any, mg:any):Candidate {
  const marketType=mg.home>=mg.away && mg.home>=mg.draw ? 'home' : mg.away>=mg.home && mg.away>=mg.draw ? 'away' : '1x';
  const probability=probabilityFor(marketType,mg);
  const odds=fairOdds(probability,false);
  return {match,market:typeLabel(marketType),marketType,odds,oddsSource:'model-fair',probability,implied:1/odds,value:0,confidence:round(50+probability*35,1),premium:false,modelAgreement:0.8,analysis:'Model-only selection. No bookmaker price was available when this prediction was generated.',modelScores:{poisson:probability,elo:probability,sportmonks:0,market:1/odds}};
}

function selectPredictions(candidates:Candidate[]){
  const sorted=[...candidates];
  const publicPick=sorted.find(x=>!x.premium && !x.marketType.startsWith('cs:')) || sorted[0];
  const selections:Candidate[]=publicPick ? [{...publicPick,premium:false}] : [];
  const seen=new Set(selections.map(x=>x.market));
  const premiumPicks=sorted
    .filter(x=>x.premium && !seen.has(x.market))
    .sort((a,b)=>b.confidence-a.confidence || b.probability-a.probability)
    .slice(0,2);
  for(const pick of premiumPicks){seen.add(pick.market); selections.push(pick);}
  if(selections.length<2){
    for(const pick of sorted){
      if(seen.has(pick.market)) continue;
      selections.push({...pick,premium:selections.length>0});
      seen.add(pick.market);
      if(selections.length>=2) break;
    }
  }
  return selections.slice(0,3);
}

export async function generateMatchPredictions(matchId:string, horizon:Horizon='daily'){
  const match:any=await Match.findById(matchId)
    .populate('homeTeamId','name shortName logo externalId')
    .populate('awayTeamId','name shortName logo externalId')
    .populate('leagueId','name logo')
    .lean();
  if(!match) return {created:[], skipped:'match-not-found'};
  if(match.status!=='scheduled') return {created:[], skipped:'not-scheduled'};

  const {stats,elo}=await buildHistoricalState(new Date(match.kickoff));
  const historical:any[]=await Match.find({status:'finished',kickoff:{$lt:new Date(match.kickoff)}}).sort({kickoff:-1}).limit(10000).select('homeScore awayScore').lean();
  const league=leagueAverages(historical);
  const odds=await getOdds(match._id);
  let raw:any=null;
  if(match.externalId){
    try {
      const payload=await fetchFixtures(new Date(match.kickoff).toISOString().slice(0,10));
      raw=(payload?.data||[]).find((x:any)=>String(x.id)===String(match.externalId))||null;
    } catch {}
  }
  let valueBets:any=null;
  if(match.externalId){ try { valueBets=await fetchFixtureValueBets(String(match.externalId)); } catch {} }

  const eg=expectedGoals(match,stats,league);
  const pm=poissonMarkets(eg.home,eg.away);
  const ep=eloProbabilities(match,elo);
  let candidates=chooseCandidates(match,odds,pm,ep,raw,valueBets);
  if(!candidates.length) candidates=[fallbackCandidate(match,pm)];
  const selections=selectPredictions(candidates);
  const created:any[]=[];
  for(const c of selections){
    let existing:any=await Prediction.findOne({matchId:match._id,systemGenerated:true,source:'ensemble',prediction:c.market,status:'published',horizon});
    if(existing){created.push(existing);continue;}
    existing=await Prediction.create({oddsSource:c.oddsSource,matchId:match._id,fixture:`${match.homeTeamId?.name||'Home'} vs ${match.awayTeamId?.name||'Away'}`,league:match.leagueId?.name||'',prediction:c.market,odds:c.odds,isPremium:c.premium,confidence:round(c.confidence,1),analysis:c.analysis,status:'published',publishedAt:new Date(),systemGenerated:true,source:'ensemble',modelVersion:'ensemble-v2-expanded-markets',modelScore:round(c.probability*100,2),expectedValue:round(c.value,4),modelAgreement:round(c.modelAgreement,4),horizon});
    created.push(existing);
  }
  return {created,skipped:null};
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
    if(!candidates.length) candidates=[fallbackCandidate(match,pm)];
    const selections=selectPredictions(candidates);
    for(const c of selections){
      const existing=await Prediction.findOne({matchId:match._id,systemGenerated:true,source:'ensemble',prediction:c.market,status:'published',horizon});
      if(existing)continue;
      await Prediction.create({oddsSource:c.oddsSource,matchId:match._id,fixture:`${match.homeTeamId?.name||'Home'} vs ${match.awayTeamId?.name||'Away'}`,league:match.leagueId?.name||'',prediction:c.market,odds:c.odds,isPremium:c.premium,confidence:round(c.confidence,1),analysis:c.analysis,status:'published',publishedAt:new Date(),systemGenerated:true,source:'ensemble',modelVersion:'ensemble-v2-expanded-markets',modelScore:round(c.probability*100,2),expectedValue:round(c.value,4),modelAgreement:round(c.modelAgreement,4),horizon});
      created++; if(c.premium)premium++; else publicCount++;
    }
  }
  return {horizon,matches:matches.length,created,premium,publicCount};
}

export async function generateDailyPredictions(date=new Date().toISOString().slice(0,10)){
  const start=new Date(`${date}T00:00:00.000Z`),end=new Date(start);end.setUTCDate(end.getUTCDate()+1); return generateForHorizon('daily',start,end);
}
export async function generateWeeklyPredictions(date=new Date().toISOString().slice(0,10)){
  const d=new Date(`${date}T00:00:00.000Z`);
  if(Number.isNaN(d.getTime())) throw new Error('Invalid weekly prediction date');
  const day=d.getUTCDay();
  const daysSinceMonday=day===0?6:day-1;
  const start=new Date(d);
  start.setUTCDate(start.getUTCDate()-daysSinceMonday);
  start.setUTCHours(0,0,0,0);
  const end=new Date(start);
  end.setUTCDate(end.getUTCDate()+7);
  return generateForHorizon('weekly',start,end);
}
