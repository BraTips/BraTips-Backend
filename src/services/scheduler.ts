import { fetchLiveFootball, fetchFixtures, syncFixtures, syncUpcomingOdds } from './providerService';
import { SyncJob } from '../models/SyncJob';
import { generateBetOfDay } from './aiBetService';
import { settleFinishedResults } from './resultService';

async function runSync(type:'daily'|'live',date?:string){
  const job=await SyncJob.create({type,status:'running',startedAt:new Date(),date});
  try{ const p:any=type==='live'?await fetchLiveFootball():await fetchFixtures(date!); const fixtures=Array.isArray(p?.data)?p.data:[]; const upserted=await syncFixtures(fixtures); job.status='success';job.fetched=fixtures.length;job.upserted=upserted;job.finishedAt=new Date();await job.save(); return job; }catch(e:any){job.status='failed';job.error=e?.message||String(e);job.finishedAt=new Date();await job.save();throw e;}
}
function isoDate(d:Date){return d.toISOString().slice(0,10)}
function shiftDate(days:number){const d=new Date();d.setUTCDate(d.getUTCDate()+days);return isoDate(d)}
function msUntilNext(hour:number,minute:number){const now=new Date();const next=new Date(now);next.setHours(hour,minute,0,0);if(next<=now)next.setDate(next.getDate()+1);return next.getTime()-now.getTime();}

async function syncDateSafe(date:string){try{await runSync('daily',date);}catch(e){console.error(`Fixture sync failed for ${date}`,e)}}
async function syncCoreDates(){
  // Keep the local database warm for today, nearby history, and the next day.
  await Promise.all([syncDateSafe(shiftDate(-1)),syncDateSafe(shiftDate(0)),syncDateSafe(shiftDate(1))]);
}
async function syncRecentHistory(){
  // Recent completed matches are what the public Results/Past Matches page needs.
  for(let i=2;i<=7;i++) await syncDateSafe(shiftDate(-i));
}

export function startScheduler(){
  // Prime the database immediately instead of waiting for the 02:00 daily job.
  void syncCoreDates();
  void syncRecentHistory();

  const scheduleDaily=()=>{setTimeout(async()=>{const date=isoDate(new Date());try{await runSync('daily',date);await generateBetOfDay(date);}catch(e){console.error('Daily scheduler failed',e);}finally{scheduleDaily();}},msUntilNext(2,0));};
  scheduleDaily();

  const fixtureRefresh=async()=>{try{await syncCoreDates();}catch(e){console.error('Core fixture refresh failed',e)}finally{setTimeout(fixtureRefresh,10*60*1000);}};
  setTimeout(fixtureRefresh,60*1000);

  const historyRefresh=async()=>{try{await syncRecentHistory();}catch(e){console.error('History fixture refresh failed',e)}finally{setTimeout(historyRefresh,30*60*1000);}};
  setTimeout(historyRefresh,5*60*1000);

  const odds=async()=>{try{await syncUpcomingOdds();}catch(e){console.error('Odds sync failed',e);}finally{setTimeout(odds,2*60*1000);}}; setTimeout(odds,20*1000);
  const live=async()=>{try{await runSync('live');await settleFinishedResults();}catch(e){console.error('Live sync failed',e);}finally{setTimeout(live,15*1000);}}; setTimeout(live,10*1000);
  const results=async()=>{try{await settleFinishedResults();}catch(e){console.error('Result settlement failed',e);}finally{setTimeout(results,60*1000);}}; setTimeout(results,45*1000);
}
export { runSync };
