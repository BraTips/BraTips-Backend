import { fetchLiveFootball, fetchFixtures, fetchFixturesBetween, syncFixtures, syncUpcomingOdds } from './providerService';
import { SyncJob } from '../models/SyncJob';
import { generateBetOfDay } from './aiBetService';
import { generateDailyPredictions, generateWeeklyPredictions } from './predictionEngine';
import { settleFinishedResults } from './resultService';
import { calculateRewardPeriod, currentMonthKey } from './rewardService';
import { RewardPeriod } from '../models/RewardPeriod';

export type SyncType = 'daily' | 'live';

async function runSync(type: SyncType, date?: string){
  const job=await SyncJob.create({type,status:'running',startedAt:new Date(),date});
  try{
    const p:any=type==='live'?await fetchLiveFootball():await fetchFixtures(date!);
    const fixtures=Array.isArray(p?.data)?p.data:[];
    const upserted=await syncFixtures(fixtures);
    job.status='success';job.fetched=fixtures.length;job.upserted=upserted;job.finishedAt=new Date();await job.save();
    return job;
  }catch(e:any){
    job.status='failed';job.error=e?.message||String(e);job.finishedAt=new Date();await job.save();throw e;
  }
}

function isoDate(d:Date){return d.toISOString().slice(0,10)}
function shiftDate(days:number, base=new Date()){const d=new Date(base);d.setUTCDate(d.getUTCDate()+days);return isoDate(d)}
function previousMonthKey(){const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);return currentMonthKey(d)}
function msUntilNext(hour:number,minute:number){const now=new Date();const next=new Date(now);next.setHours(hour,minute,0,0);if(next<=now)next.setDate(next.getDate()+1);return next.getTime()-now.getTime();}

function mondayFor(date = new Date()): Date {
  const d = new Date(date);
  d.setUTCHours(0,0,0,0);
  const day = d.getUTCDay(); // Sunday=0, Monday=1
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

function nextMondayMidnightDelay(){
  const now=new Date();
  const next=mondayFor(now);
  if(next<=now) next.setUTCDate(next.getUTCDate()+7);
  return Math.max(1000,next.getTime()-now.getTime());
}

async function syncDateSafe(date:string){try{await runSync('daily',date);}catch(e){console.error(`Fixture sync failed for ${date}`,e)}}
async function syncCoreDates(){
  await Promise.all([syncDateSafe(shiftDate(-1)),syncDateSafe(shiftDate(0)),syncDateSafe(shiftDate(1))]);
  try{await settleFinishedResults();}catch(e){console.error('Core settlement failed',e)}
}

async function calculatePreviousMonthRewards(){
  try{
    const key=previousMonthKey();
    const existing=await RewardPeriod.findOne({key});
    if(!existing || existing.status==='open') await calculateRewardPeriod(key);
  }catch(e){console.error('Monthly reward calculation failed',e)}
}

async function syncRecentHistory(){
  for(let i=2;i<=7;i++) await syncDateSafe(shiftDate(-i));
  try{await settleFinishedResults();}catch(e){console.error('History settlement failed',e)}
}

/**
 * Sync the complete Monday-Sunday football week and generate the weekly prediction set.
 * The week is anchored to UTC Monday midnight, which also matches Ghana time (UTC).
 */
export async function runWeeklySync(startDate?: string){
  const requested = startDate ? new Date(`${startDate}T00:00:00.000Z`) : new Date();
  if(Number.isNaN(requested.getTime())) throw new Error('Invalid weekly sync date');
  const monday = mondayFor(requested);
  const weekStart = isoDate(monday);
  const weekEndDate = new Date(monday); weekEndDate.setUTCDate(weekEndDate.getUTCDate()+6);
  const weekEnd = isoDate(weekEndDate);

  const existing = await SyncJob.findOne({type:'weekly',date:weekStart,status:'running'}).sort({startedAt:-1});
  if(existing) return existing;

  const job=await SyncJob.create({type:'weekly',status:'running',startedAt:new Date(),date:weekStart});
  let fetched=0, upserted=0;
  try{
    const p:any=await fetchFixturesBetween(weekStart,weekEnd);
    const fixtures=Array.isArray(p?.data)?p.data:[];
    fetched=fixtures.length;
    upserted=await syncFixtures(fixtures);
    if(fetched===0) throw new Error(`Sportmonks returned 0 fixtures for ${weekStart} to ${weekEnd}. Check that FOOTBALL_API_KEY is valid and that your Sportmonks subscription includes the leagues and dates requested.`);
    await syncUpcomingOdds();
    const weekly=await generateWeeklyPredictions(weekStart);
    const daily=await generateDailyPredictions(weekStart);
    await generateBetOfDay(weekStart).catch(e=>console.error('Weekly Bet of the Day generation failed',e));
    job.status='success';job.fetched=fetched;job.upserted=upserted;job.finishedAt=new Date();await job.save();
    console.log(`Weekly sync complete for ${weekStart}: ${fetched} fixtures, ${upserted} saved, ${weekly.created ?? 0} weekly predictions, ${daily.created ?? 0} daily predictions.`);
    return job;
  }catch(e:any){
    job.status='failed';job.fetched=fetched;job.upserted=upserted;job.error=e?.message||String(e);job.finishedAt=new Date();await job.save();throw e;
  }
}

export async function runCustomSync(startDate:string,endDate:string){
  const start=new Date(`${startDate}T00:00:00.000Z`);
  const end=new Date(`${endDate}T00:00:00.000Z`);
  if(Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('Invalid custom sync date range');
  if(end<start) throw new Error('End date must be on or after start date');
  const days=Math.floor((end.getTime()-start.getTime())/86400000)+1;
  if(days>31) throw new Error('Custom sync range cannot exceed 31 days');
  const job=await SyncJob.create({type:'manual',status:'running',startedAt:new Date(),date:startDate});
  let fetched=0, upserted=0;
  try{
    const p:any=await fetchFixturesBetween(startDate,endDate);
    const fixtures=Array.isArray(p?.data)?p.data:[];
    fetched=fixtures.length;
    upserted=await syncFixtures(fixtures);
    if(fetched>0) await syncUpcomingOdds();
    const weekly=await generateWeeklyPredictions(startDate);
    const daily=await generateDailyPredictions(startDate);
    job.status='success';job.fetched=fetched;job.upserted=upserted;job.finishedAt=new Date();await job.save();
    return {job,weekly,daily};
  }catch(e:any){
    job.status='failed';job.fetched=fetched;job.upserted=upserted;job.error=e?.message||String(e);job.finishedAt=new Date();await job.save();throw e;
  }
}

async function catchUpCurrentWeek(){
  try{
    const monday=isoDate(mondayFor(new Date()));
    const completed=await SyncJob.exists({type:'weekly',date:monday,status:'success'});
    if(!completed){
      console.log(`No completed weekly sync found for ${monday}; running current-week catch-up.`);
      await runWeeklySync(monday);
    }
  }catch(e){console.error('Weekly sync catch-up failed',e)}
}

export function startScheduler(){
  // Prime the database immediately instead of waiting for the scheduled jobs.
  void catchUpCurrentWeek();
  void syncCoreDates();
  void (async()=>{try{
    const today=isoDate(new Date());
    await Promise.all([syncDateSafe(shiftDate(2)),syncDateSafe(shiftDate(3)),syncDateSafe(shiftDate(4)),syncDateSafe(shiftDate(5)),syncDateSafe(shiftDate(6)),syncDateSafe(shiftDate(7))]);
    await syncUpcomingOdds();
    await generateDailyPredictions(today);
    await generateWeeklyPredictions(today);
  }catch(e){console.error('Prediction engine warmup failed',e)}})();
  void syncRecentHistory();

  // Every Monday at 00:00 UTC (00:00 Ghana time), populate the new Monday-Sunday week.
  const scheduleWeekly=()=>{
    setTimeout(async()=>{
      try{await runWeeklySync();}
      catch(e){console.error('Weekly scheduler failed',e);}
      finally{scheduleWeekly();}
    },nextMondayMidnightDelay());
  };
  scheduleWeekly();

  const scheduleDaily=()=>{setTimeout(async()=>{const date=isoDate(new Date());try{await runSync('daily',date);await syncDateSafe(shiftDate(2));await syncDateSafe(shiftDate(3));await syncDateSafe(shiftDate(4));await syncDateSafe(shiftDate(5));await syncDateSafe(shiftDate(6));await syncDateSafe(shiftDate(7));await syncUpcomingOdds();await generateDailyPredictions(date);await generateWeeklyPredictions(date);await generateBetOfDay(date);if(new Date().getUTCDate()===1) await calculatePreviousMonthRewards();}catch(e){console.error('Daily scheduler failed',e);}finally{scheduleDaily();}},msUntilNext(2,0));};
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
