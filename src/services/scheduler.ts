import { fetchLiveFootball, fetchFixtures, syncFixtures, syncUpcomingOdds } from './providerService';
import { settleFinishedMatches } from './settlementService';
import { SyncJob } from '../models/SyncJob';
import { generateBetOfDay } from './aiBetService';

async function runSync(type:'daily'|'live',date?:string){
  const job=await SyncJob.create({type,status:'running',startedAt:new Date(),date});
  try{ const p:any=type==='live'?await fetchLiveFootball():await fetchFixtures(date!); const fixtures=Array.isArray(p?.data)?p.data:[]; const upserted=await syncFixtures(fixtures); job.status='success';job.fetched=fixtures.length;job.upserted=upserted;job.finishedAt=new Date();await job.save(); return job; }catch(e:any){job.status='failed';job.error=e?.message||String(e);job.finishedAt=new Date();await job.save();throw e;}
}
function msUntilNext(hour:number,minute:number){const now=new Date();const next=new Date(now);next.setHours(hour,minute,0,0);if(next<=now)next.setDate(next.getDate()+1);return next.getTime()-now.getTime();}
export function startScheduler(){
  const scheduleDaily=()=>{setTimeout(async()=>{const date=new Date().toISOString().slice(0,10);try{await runSync('daily',date);await generateBetOfDay(date);}catch(e){console.error('Daily scheduler failed',e);}finally{scheduleDaily();}},msUntilNext(2,0));};
  scheduleDaily();
  const odds=async()=>{try{await syncUpcomingOdds();}catch(e){console.error('Odds sync failed',e);}finally{setTimeout(odds,3*60*1000);}}; setTimeout(odds,20*1000);
  const live=async()=>{try{await runSync('live'); await settleFinishedMatches();}catch(e){console.error('Live sync failed',e);}finally{setTimeout(live,60*1000);}}; setTimeout(live,30*1000);
  const results=async()=>{try{const date=new Date().toISOString().slice(0,10); const p:any=await fetchFixtures(date); const fixtures=Array.isArray(p?.data)?p.data:[]; await syncFixtures(fixtures); await settleFinishedMatches();}catch(e){console.error('Results sync failed',e);}finally{setTimeout(results,5*60*1000);}}; setTimeout(results,90*1000);
}
export { runSync };
