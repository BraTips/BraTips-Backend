import { Match } from '../models/Match';
import { Team } from '../models/Team';
import { League } from '../models/League';
import { BetOfDay } from '../models/BetOfDay';
import { env } from '../config/env';
import { OddsSnapshot } from '../models/OddsSnapshot';

async function openAISelect(candidates:any[]) {
  const key=env.OPENAI_API_KEY; if(!key) return null;
  const model=env.OPENAI_MODEL;
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,input:[{role:'system',content:'Select exactly 2 upcoming football matches for the automatic public Bet of the Day. Do not call anything guaranteed or safe. Do not default to Double Chance: diversify across supported markets such as 1X2, Double Chance, BTTS, Over/Under, corners and other available markets. At least one selection may be higher odds when the available market and matchup support a plausible outcome; balance confidence with value rather than always choosing the lowest odds. Return strict JSON array with matchId, prediction, confidence, risk, analysis. For double chance, the prediction MUST contain exactly one of 1X, X2, or 12; never return the phrase Double Chance by itself.'},{role:'user',content:JSON.stringify(candidates)}],text:{format:{type:'json_schema',name:'bet_of_day',schema:{type:'object',properties:{picks:{type:'array',items:{type:'object',properties:{matchId:{type:'string'},prediction:{type:'string'},confidence:{type:'number'},risk:{type:'string'},analysis:{type:'string'}},required:['matchId','prediction','confidence','risk','analysis'],additionalProperties:false},minItems:2,maxItems:2}},required:['picks'],additionalProperties:false},strict:true}}})});
  if(!response.ok) throw new Error(`AI request failed: ${response.status}`); const body:any=await response.json();
  const text=body.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text; return text?JSON.parse(text).picks as any[]:null;
}
export async function generateBetOfDay(date=new Date().toISOString().slice(0,10)){
  // Once today's automatic picks are published, keep them stable for the rest of the day.
  // This prevents refreshes/restarts from silently swapping the public selection.
  const existing=await BetOfDay.find({date,status:{$in:['published','won','lost','void']}}).sort({createdAt:1});
  if(existing.length>=2) return existing.slice(0,2);
  const from=new Date(`${date}T00:00:00.000Z`),to=new Date(`${date}T23:59:59.999Z`);
  const matches=await Match.find({kickoff:{$gte:from,$lte:to},status:'scheduled'}).sort({kickoff:1}).limit(40).populate('homeTeamId','name').populate('awayTeamId','name').populate('leagueId','name');
  if(matches.length<2) throw new Error('At least two upcoming matches are required');
  const snapshots=await OddsSnapshot.find({matchId:{$in:matches.map(m=>m._id)},mode:'pre-match'}).sort({recordedAt:-1}).limit(3000).lean();
  const latestMarkets=new Map<string,any[]>();
  for(const o of snapshots){const key=String(o.matchId);if(!latestMarkets.has(key))latestMarkets.set(key,[]);const arr=latestMarkets.get(key)!;const sig=`${o.marketId||''}|${o.label}`;if(!arr.some(x=>x.sig===sig))arr.push({sig,market:o.marketName||'Market',label:o.label,odds:Number(o.value||0)});}
  const candidates=matches.map((m:any)=>({matchId:String(m._id),fixture:`${m.homeTeamId?.name||'Home'} vs ${m.awayTeamId?.name||'Away'}`,league:m.leagueId?.name||'',kickoff:m.kickoff,markets:(latestMarkets.get(String(m._id))||[]).slice(0,18)}));
  let picks:any[]|null=null, model='heuristic';
  try { picks=await openAISelect(candidates); if(picks?.length) model=process.env.OPENAI_MODEL||'gpt-5.6-luna'; } catch(e){ console.warn('Bet of Day AI fallback:',e); }
  if(!picks){ picks=matches.slice(0,2).map((m:any,i)=>({matchId:String(m._id),prediction:i===0?'Over 1.5 Goals':'Both Teams To Score',confidence:Math.max(55,68-i*4),risk:i===0?'low':'medium',analysis:'Automatic selection based on scheduled fixture availability and available market data; this is not a guarantee.'})); }
  await BetOfDay.deleteMany({date,status:{$in:['draft','approved','published']}});
  const docs=[]; for(const p of picks.slice(0,2)){ if(!matches.some(m=>String(m._id)===String(p.matchId))) continue; const ref=await OddsSnapshot.findOne({matchId:p.matchId,mode:'pre-match',label:{$regex:new RegExp(String(p.prediction).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i')}}).sort({recordedAt:-1}); docs.push(await BetOfDay.findOneAndUpdate({date,matchId:p.matchId},{$set:{prediction:p.prediction,odds:ref?.value,confidence:p.confidence,risk:p.risk,analysis:p.analysis,model,status:'published'}},{upsert:true,new:true,setDefaultsOnInsert:true})); }
  return docs;
}
