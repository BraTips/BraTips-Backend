import { Router } from "express";
import { League } from "../models/League";
import { Season } from "../models/Season";
import { Team } from "../models/Team";
import { Match } from "../models/Match";
export const publicRouter = Router();
async function attachLatestOdds(data:any[]){
  const ids=data.map((m:any)=>m._id); if(!ids.length)return data;
  const snapshots=await OddsSnapshot.find({matchId:{$in:ids},mode:'pre-match'}).sort({recordedAt:-1}).limit(2000);
  const seen=new Set<string>(); const by=new Map<string,any[]>();
  for(const o of snapshots){const k=String(o.matchId)+'|'+String(o.marketId)+'|'+o.label;if(seen.has(k))continue;seen.add(k);const id=String(o.matchId);if(!by.has(id))by.set(id,[]);by.get(id)!.push(o);}
  return data.map((m:any)=>({...m.toObject(),odds:(by.get(String(m._id))||[]).slice(0,12)}));
}


publicRouter.get("/leagues", async (_req,res)=>res.json({data: await League.find({active:true}).sort({name:1})}));
publicRouter.get("/leagues/:id", async (req,res)=>{ const x=await League.findById(req.params.id); if(!x)return res.status(404).json({message:"League not found"}); res.json({data:x}); });
publicRouter.get("/teams", async (_req,res)=>res.json({data: await Team.find({active:true}).sort({name:1})}));
publicRouter.get("/teams/:id", async (req,res)=>{ const x=await Team.findById(req.params.id); if(!x)return res.status(404).json({message:"Team not found"}); res.json({data:x}); });
publicRouter.get("/matches", async (req,res)=>{
  const filter:any={}; if(typeof req.query.status==="string")filter.status=req.query.status;
  if(typeof req.query.leagueId==="string")filter.leagueId=req.query.leagueId;
  const page=Math.max(Number(req.query.page)||1,1), limit=Math.min(Math.max(Number(req.query.limit)||50,1),100);
  let [data,total]=await Promise.all([
    Match.find(filter).populate("leagueId","name country logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo").sort(filter.status==='finished'?{kickoff:-1}:{kickoff:1}).skip((page-1)*limit).limit(limit),
    Match.countDocuments(filter)
  ]);
  // Results/Past Matches should not be empty just because the server was restarted.
  if(filter.status==='finished' && total===0){
    for(let i=1;i<=7;i++){ const d=new Date(); d.setUTCDate(d.getUTCDate()-i); try{ const payload=await fetchFixtures(d.toISOString().slice(0,10)); await syncFixtures(Array.isArray(payload?.data)?payload.data:[]); }catch(e){ console.error('Past fixture fallback failed',e); } }
    [data,total]=await Promise.all([
      Match.find(filter).populate("leagueId","name country logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo").sort({kickoff:-1}).skip((page-1)*limit).limit(limit),
      Match.countDocuments(filter)
    ]);
  }
  const enriched=await attachLatestOdds(data);
  res.json({data:enriched,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
});
publicRouter.get("/matches/today", async (_req,res,next)=>{
  try {
    const start=new Date();start.setUTCHours(0,0,0,0);const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
    let data=await Match.find({kickoff:{$gte:start,$lt:end}}).populate("leagueId","name country logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo").sort({kickoff:1});
    // If the scheduler has not warmed the database yet, hydrate today's fixtures once.
    if(data.length===0){ try { const payload=await fetchFixtures(start.toISOString().slice(0,10)); await syncFixtures(Array.isArray(payload?.data)?payload.data:[]); data=await Match.find({kickoff:{$gte:start,$lt:end}}).populate("leagueId","name country logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo").sort({kickoff:1}); } catch(e){ console.error('Today fixture fallback failed',e); } }
    res.json({data:await attachLatestOdds(data)});
  } catch(e){next(e)}
});
publicRouter.get("/matches/live", async (_req,res,next)=>{
  try {
    let data=await Match.find({status:"live"}).populate("leagueId","name logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo").sort({kickoff:1});
    // Livescore fallback makes the public Live tab work even if the background scheduler restarted.
    try { const payload=await fetchLiveFootball(); const fixtures=Array.isArray(payload?.data)?payload.data:[]; if(fixtures.length){ await syncFixtures(fixtures); data=await Match.find({status:"live"}).populate("leagueId","name logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo").sort({kickoff:1}); } } catch(e){ if(!data.length) throw e; console.error('Live fallback failed',e); }
    res.json({data:await attachLatestOdds(data)});
  } catch(e){next(e)}
});
publicRouter.get("/matches/:id/research", async (req,res,next)=>{
  try {
    const match:any=await Match.findById(req.params.id)
      .populate("leagueId","name country logo")
      .populate("homeTeamId","name shortName logo externalId")
      .populate("awayTeamId","name shortName logo externalId")
      .populate("seasonId","name externalId");
    if(!match) return res.status(404).json({message:"Match not found"});

    const fixture=match.externalId ? await fetchFixture(String(match.externalId)).catch((e:any)=>{ console.error('Fixture research provider fallback failed',e?.message||e); return {data:null}; }) : {data:null};
    const raw=fixture?.data || {};
    const homeExternal=match.homeTeamId?.externalId;
    const awayExternal=match.awayTeamId?.externalId;
    const seasonExternal=match.seasonId?.externalId;

    const [h2h,standings,homeRecent,awayRecent]=await Promise.all([
      homeExternal && awayExternal ? fetchHeadToHead(String(homeExternal),String(awayExternal)).catch(()=>({data:[]})) : Promise.resolve({data:[]}),
      seasonExternal ? fetchStandingsBySeason(String(seasonExternal)).catch(()=>({data:[]})) : Promise.resolve({data:[]}),
      homeExternal ? fetchTeamRecentFixtures(String(homeExternal),90).catch(()=>({data:[]})) : Promise.resolve({data:[]}),
      awayExternal ? fetchTeamRecentFixtures(String(awayExternal),90).catch(()=>({data:[]})) : Promise.resolve({data:[]})
    ]);

    const normaliseRecent=(payload:any, teamExternal:string)=>{
      const rows=Array.isArray(payload?.data)?payload.data:[];
      return rows.filter((x:any)=>x.id!==raw.id).sort((a:any,b:any)=>new Date(b.starting_at||0).getTime()-new Date(a.starting_at||0).getTime()).slice(0,5).map((x:any)=>({
        id:x.id,name:x.name,kickoff:x.starting_at,result:x.result_info||null,league:x.league?.name||'',scores:x.scores||[],status:x.state?.short_name||x.state?.developer_name||''
      }));
    };

    const table=(Array.isArray(standings?.data)?standings.data:[]).filter((x:any)=>String(x.participant_id)===String(homeExternal)||String(x.participant_id)===String(awayExternal)).map((x:any)=>({
      participantId:x.participant_id,position:x.position,points:x.points,participant:x.participant?.name||'',details:(x.details||[]).map((d:any)=>({name:d.type?.name||'',value:d.value?.value??d.value}))
    }));

    res.json({data:{
      fixture:raw,
      statistics:raw.statistics||[],
      xg:raw.xgfixture||[],
      events:raw.events||[],
      lineups:raw.lineups||[],
      predictions:raw.predictions||[],
      h2h:(Array.isArray(h2h?.data)?h2h.data:[]).slice(0,10),
      standings:table,
      recent:{home:normaliseRecent(homeRecent,String(homeExternal||'')),away:normaliseRecent(awayRecent,String(awayExternal||''))}
    }});
  } catch(e) { next(e); }
});

publicRouter.get("/matches/:id/odds", async (req,res,next)=>{
  try{
    const match=await Match.findById(req.params.id); if(!match)return res.status(404).json({message:'Match not found'});
    const mode=req.query.mode==='inplay'?'inplay':'pre-match';
    let rows=await OddsSnapshot.find({matchId:match._id,mode}).sort({recordedAt:-1}).limit(500);
    if(!rows.length && match.externalId){
      const payload=await fetchFixtureOdds(String(match.externalId),mode);
      const live=flattenOdds(payload);
      rows=live.map((o:any)=>({fixtureExternalId:o.fixtureId,bookmakerId:o.bookmakerId,bookmakerName:o.bookmakerName,marketId:o.marketId,marketName:o.marketName,label:o.label,value:o.value,previousValue:undefined,movementPct:undefined,mode,bookmakerUpdatedAt:o.bookmakerUpdatedAt,recordedAt:new Date()})) as any;
    }
    const latest:any[]=[]; const seen=new Set<string>();
    for(const row of rows){const key=`${row.bookmakerId||0}:${row.marketId||0}:${row.label}`;if(!seen.has(key)){seen.add(key);latest.push(row);}}
    res.json({data:latest});
  }catch(e){next(e)}
});
publicRouter.get("/matches/:id", async (req,res)=>{
  const x=await Match.findById(req.params.id).populate("leagueId","name country logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo");
  if(!x)return res.status(404).json({message:"Match not found"});
  res.json({data:x});
});
publicRouter.get('/dropping-odds',async(req,res,next)=>{
  try{
    const minDrop=Math.max(Number(req.query.minDrop)||0,0);
    const rows=await OddsSnapshot.aggregate([
      {$match:{mode:'pre-match',movementPct:{$lte:-minDrop}}},
      {$sort:{movementPct:1,recordedAt:-1}},
      {$group:{_id:{matchId:'$matchId',bookmakerId:'$bookmakerId',marketId:'$marketId',label:'$label'},row:{$first:'$$ROOT'}}},
      {$replaceRoot:{newRoot:'$row'}},
      {$sort:{movementPct:1,recordedAt:-1}},{$limit:1000}
    ]);
    const matchIds=rows.map(x=>x.matchId);
    const now=new Date();
    const end=new Date(now.getTime()+72*60*60*1000);
    const matches=await Match.find({_id:{$in:matchIds},kickoff:{$gte:now,$lte:end},status:{$in:['scheduled','live']}}).populate('leagueId','name logo').populate('homeTeamId','name shortName logo').populate('awayTeamId','name shortName logo');
    const byId=new Map(matches.map((m:any)=>[String(m._id),m]));
    res.json({data:rows.map(x=>({...x,matchId:byId.get(String(x.matchId))||null})).filter(x=>x.matchId)});
  }catch(e){next(e)}
});
import { Prediction } from "../models/Prediction";
import { TipsterProfile } from "../models/TipsterProfile";
import { BetOfDay } from "../models/BetOfDay";
import { OddsSnapshot } from "../models/OddsSnapshot";
import { fetchFixtureOdds, flattenOdds, fetchFixture, fetchHeadToHead, fetchStandingsBySeason, fetchTeamRecentFixtures, fetchFixtures, fetchLiveFootball, syncFixtures } from "../services/providerService";

publicRouter.get("/tipsters", async (_req,res,next)=>{try{const data=await TipsterProfile.find({active:true}).sort({wins:-1,roi:-1}).limit(100).select("username bio country expertise profilePhoto totalTips wins losses profit roi currentStreak longestStreak totalRewardsPaid");res.json({data});}catch(e){next(e)}});
publicRouter.get("/tipsters/rankings", async(req,res,next)=>{try{
  const raw=typeof req.query.month==='string'?req.query.month:'';
  const match=raw.match(/^(\d{4})-(\d{2})$/);
  const now=new Date(); const year=match?Number(match[1]):now.getUTCFullYear(); const month=match?Number(match[2]):now.getUTCMonth()+1;
  if(month<1||month>12) return res.status(400).json({message:'Invalid month'});
  const start=new Date(Date.UTC(year,month-1,1)); const end=new Date(Date.UTC(year,month,1));
  const rows=await Prediction.aggregate([
    {$match:{status:{$in:['won','lost','void']},resultAt:{$gte:start,$lt:end}}},
    {$group:{_id:'$tipsterId',settled:{$sum:{$cond:[{$in:['$status',['won','lost']]},1,0]}},wins:{$sum:{$cond:[{$eq:['$status','won']},1,0]}},losses:{$sum:{$cond:[{$eq:['$status','lost']},1,0]}},profit:{$sum:{$ifNull:['$profit',0]}},oddsSum:{$sum:{$cond:[{$in:['$status',['won','lost']]},'$odds',0]}}}},
    {$match:{settled:{$gt:0}}},{$sort:{profit:-1,settled:-1}},{$limit:100}
  ]);
  const ids=rows.map((r:any)=>r._id); const profiles=await TipsterProfile.find({userId:{$in:ids},active:true}).select('userId username country profilePhoto').lean();
  const by=new Map(profiles.map((p:any)=>[String(p.userId),p]));
  const data=rows.map((r:any)=>{const p=by.get(String(r._id)); const settled=Number(r.settled||0); const profit=Number(r.profit||0); const odds=Number(r.oddsSum||0); return p?{userId:String(r._id),username:p.username,country:p.country,profilePhoto:p.profilePhoto,settled,wins:Number(r.wins||0),losses:Number(r.losses||0),profit,winRate:settled?Number(r.wins||0)/settled*100:0,roi:odds?profit/odds*100:0}:null}).filter(Boolean);
  data.sort((a:any,b:any)=>b.profit-a.profit||b.roi-a.roi||b.winRate-a.winRate); res.json({data,month:`${year}-${String(month).padStart(2,'0')}`});
}catch(e){next(e)}});
publicRouter.get("/tipsters/:username", async(req,res,next)=>{try{const profile=await TipsterProfile.findOne({username:req.params.username,active:true}).select("userId username bio country expertise profilePhoto totalTips wins losses profit roi currentStreak longestStreak");if(!profile)return res.status(404).json({message:"Tipster not found"});const predictions=await Prediction.find({tipsterId:profile.userId,status:{ $in:["published","won","lost","void"]}}).populate({path:'matchId',populate:[{path:'homeTeamId',select:'name shortName logo'},{path:'awayTeamId',select:'name shortName logo'},{path:'leagueId',select:'name logo'}]}).sort({publishedAt:-1,createdAt:-1}).limit(100);res.json({data:{profile,predictions}});}catch(e){next(e)}});
publicRouter.get("/predictions", async(req,res,next)=>{try{
  const page=Math.max(Number(req.query.page)||1,1),limit=Math.min(Math.max(Number(req.query.limit)||30,1),50);
  const search=typeof req.query.search==='string'?req.query.search.trim():'';
  const filter:any={status:{ $in:["published","won","lost","void"]}};
  if(search)filter.$or=[{fixture:{$regex:search,$options:'i'}},{league:{$regex:search,$options:'i'}},{prediction:{$regex:search,$options:'i'}}];
  const query=Prediction.find(filter)
    .select('tipsterId matchId fixture league prediction odds isPremium confidence analysis status profit publishedAt resultAt createdAt')
    .populate('tipsterId','name')
    .populate({path:'matchId',select:'kickoff status homeScore awayScore homeTeamId awayTeamId leagueId',populate:[
      {path:'homeTeamId',select:'name shortName logo'},
      {path:'awayTeamId',select:'name shortName logo'},
      {path:'leagueId',select:'name logo'}
    ]})
    .sort({publishedAt:-1,createdAt:-1}).skip((page-1)*limit).limit(limit).lean();
  const [data,total]=await Promise.all([query,Prediction.countDocuments(filter)]);
  res.json({data,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}catch(e){next(e)}});
publicRouter.get("/predictions/:id",async(req,res,next)=>{try{
  const item=await Prediction.findOne({_id:req.params.id,status:{ $in:["published","won","lost","void"]}})
    .populate('tipsterId','name')
    .populate({path:'matchId',populate:[
      {path:'homeTeamId',select:'name shortName logo externalId'},
      {path:'awayTeamId',select:'name shortName logo externalId'},
      {path:'leagueId',select:'name logo country'},
      {path:'seasonId',select:'name externalId'}
    ]});
  if(!item)return res.status(404).json({message:'Prediction not found'});
  res.json({data:item});
}catch(e){next(e)}});
publicRouter.get("/prediction-history",async(req,res,next)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||50,1),200);const filter:any={status:{ $in:["won","lost","void"]}};const [data,stats]=await Promise.all([Prediction.find(filter).populate('tipsterId','name').populate({path:'matchId',populate:[{path:'homeTeamId',select:'name shortName logo'},{path:'awayTeamId',select:'name shortName logo'},{path:'leagueId',select:'name logo'}]}).sort({resultAt:-1,createdAt:-1}).limit(limit),Prediction.aggregate([{$match:filter},{$group:{_id:null,total:{$sum:1},wins:{$sum:{$cond:[{$eq:['$status','won']},1,0]}},profit:{$sum:{$ifNull:['$profit',0]}}}},{$project:{_id:0,total:1,wins:1,profit:1,winRate:{$cond:[{$gt:['$total',0]},{$multiply:[{$divide:['$wins','$total']},100]},0]}}}])]);res.json({data,stats:stats[0]||{total:0,wins:0,profit:0,winRate:0}});}catch(e){next(e)}});
publicRouter.get("/bet-of-day/recent",async(req,res,next)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||50,1),100);const data=await BetOfDay.find({status:{ $in:["won","lost","void"]}}).populate({path:'matchId',select:'kickoff status homeScore awayScore homeTeamId awayTeamId leagueId',populate:[{path:'homeTeamId',select:'name shortName logo'},{path:'awayTeamId',select:'name shortName logo'},{path:'leagueId',select:'name logo'}]}).sort({date:-1,createdAt:-1}).limit(limit);res.json({data});}catch(e){next(e)}});
publicRouter.get("/bet-of-day",async(req,res,next)=>{try{const date=typeof req.query.date==='string'?req.query.date:new Date().toISOString().slice(0,10);const data=await BetOfDay.find({date,status:{ $in:["published","won","lost","void"]}}).populate({path:'matchId',populate:[{path:'homeTeamId',select:'name logo'},{path:'awayTeamId',select:'name logo'},{path:'leagueId',select:'name logo'}]}).sort({createdAt:1});res.json({data});}catch(e){next(e)}});
