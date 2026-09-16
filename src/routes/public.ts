import { Router } from "express";
import { optionalAuth, type AuthRequest } from "../middleware/auth";
import { Subscription } from "../models/Subscription";
import { League } from "../models/League";
import { Season } from "../models/Season";
import { Team } from "../models/Team";
import { Match } from "../models/Match";
import { OddsSnapshot } from "../models/OddsSnapshot";
import { fetchFixtures, fetchLiveFootball, fetchFixture, fetchFixtureOdds, fetchHeadToHead, fetchStandingsBySeason, fetchTeamRecentFixtures, flattenOdds, syncFixtures } from "../services/providerService";
import { generateMatchPredictions } from "../services/predictionEngine";
export const publicRouter = Router();
async function attachLatestOdds(data:any[], mode:'pre-match'|'inplay'='pre-match'){
  const ids=data.map((m:any)=>m._id); if(!ids.length)return data;
  const snapshots=await OddsSnapshot.find({matchId:{$in:ids},mode}).sort({recordedAt:-1}).limit(3000);
  const seen=new Set<string>(); const by=new Map<string,any[]>();
  for(const o of snapshots){const k=String(o.matchId)+'|'+String(o.marketId)+'|'+o.label;if(seen.has(k))continue;seen.add(k);const id=String(o.matchId);if(!by.has(id))by.set(id,[]);by.get(id)!.push(o);}
  return data.map((m:any)=>({...m.toObject(),odds:(by.get(String(m._id))||[]).slice(0,12),oddsMode:mode,oddsLabel:'BraTipsters Odds'}));
}

function bestPublicOdds(rows:any[]){
  const best=new Map<string,any>();
  for(const row of Array.isArray(rows)?rows:[]){
    const key=`${row.marketId||row.marketName||''}|${row.label||row.name||''}`;
    const current=best.get(key);
    if(!current || Number(row.value||0)>Number(current.value||0)) best.set(key,row);
  }
  return [...best.values()].sort((a,b)=>Number(b.value||0)-Number(a.value||0)).slice(0,12);
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
    // In-play prices are the live Sportmonks bookmaker feed. Expose them as BraTipsters Odds
    // on the public site and prefer the freshest saved snapshot, falling back to Sportmonks.
    let enriched=await attachLatestOdds(data,'inplay');
    enriched=enriched.map((m:any)=>({...m,odds:bestPublicOdds(m.odds||[])}));
    for(const m of enriched){
      if(!m.odds?.length && m.externalId){
        try {
          const live=flattenOdds(await fetchFixtureOdds(String(m.externalId),'inplay'));
          m.odds=bestPublicOdds(live.map((o:any)=>({...o,mode:'inplay'})));
          m.oddsMode='inplay'; m.oddsLabel='BraTipsters Odds';
        } catch {}
      }
    }
    res.json({data:enriched});
  } catch(e){next(e)}
});
publicRouter.get("/matches/:id/prediction", optionalAuth, async (req:AuthRequest,res,next)=>{
  try {
    const match:any=await Match.findById(req.params.id).populate('homeTeamId','name shortName logo').populate('awayTeamId','name shortName logo').populate('leagueId','name logo');
    if(!match) return res.status(404).json({message:'Match not found'});

    let rows:any[]=await Prediction.find({matchId:match._id,systemGenerated:true,source:'ensemble',status:'published',horizon:'daily'}).sort({isPremium:1,modelScore:-1}).lean();
    if(!rows.length && match.status==='scheduled') {
      await generateMatchPredictions(String(match._id),'daily');
      rows=await Prediction.find({matchId:match._id,systemGenerated:true,source:'ensemble',status:'published',horizon:'daily'}).sort({isPremium:1,modelScore:-1}).lean();
    }

    const premium=Boolean(req.user && await Subscription.exists({userId:req.user.id,plan:'premium',status:{$in:['active','trialing']}}));
    const data=rows.map((p:any)=>{
      const locked=Boolean(p.isPremium && !premium);
      if(!locked) return {...p,locked:false};
      return {...p,locked:true,prediction:null,odds:null,confidence:null,analysis:null,modelScore:null,expectedValue:null,modelAgreement:null};
    });
    res.json({data,hasPrediction:data.length>0});
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
publicRouter.get("/predictions", optionalAuth, async(req:AuthRequest,res,next)=>{try{
  const page=Math.max(Number(req.query.page)||1,1),limit=Math.min(Math.max(Number(req.query.limit)||30,1),50);
  const search=typeof req.query.search==='string'?req.query.search.trim():'';
  const market=typeof req.query.market==='string'?req.query.market.trim().toLowerCase():'';
  const horizon=typeof req.query.horizon==='string' && ['daily','weekly'].includes(req.query.horizon)?req.query.horizon:undefined;
  const filter:any={status:{ $in:["published","won","lost","void"]}};
  if(horizon){
    filter.horizon=horizon;
    // Keep the public daily/weekly feeds scoped to the current calendar period.
    // Otherwise previously generated weekly records remain visible after the week changes.
    const now=new Date();
    const periodStart=new Date(now); periodStart.setUTCHours(0,0,0,0);
    const periodEnd=new Date(periodStart);
    if(horizon==='weekly'){
      const day=periodStart.getUTCDay();
      const daysSinceMonday=day===0?6:day-1;
      periodStart.setUTCDate(periodStart.getUTCDate()-daysSinceMonday);
      periodEnd.setTime(periodStart.getTime());
      periodEnd.setUTCDate(periodEnd.getUTCDate()+7);
    }else{
      periodEnd.setUTCDate(periodEnd.getUTCDate()+1);
    }
    const periodMatches=await Match.find({kickoff:{$gte:periodStart,$lt:periodEnd}}).select('_id').lean();
    filter.matchId={$in:periodMatches.map((m:any)=>m._id)};
  }
  if(String(req.query.tipster||'')==='true') filter.tipsterId={$exists:true,$ne:null};
  if(String(req.query.upcoming||'')==='true'){
    const upcomingMatches=await Match.find({status:'scheduled',kickoff:{$gt:new Date()}}).select('_id').lean();
    filter.matchId={$in:upcomingMatches.map((m:any)=>m._id)};
  }
  if(market){
    const marketMap:any={
      'home-win':'Home Win','away-win':'Away Win','draw':'Draw',
      'double-chance-1x':'Double Chance 1X','double-chance-x2':'Double Chance X2','double-chance-12':'Double Chance 12',
      'over-2-5':'Over 2.5 Goals','under-2-5':'Under 2.5 Goals',
      'btts':'Both Teams To Score','btts-no':'BTTS - No','corners':'Corners'
    };
    const target=marketMap[market];
    if(target) filter.prediction=market==='corners'?{$regex:'corner',$options:'i'}:target;
  }
  if(search)filter.$or=[{fixture:{$regex:search,$options:'i'}},{league:{$regex:search,$options:'i'}},{prediction:{$regex:search,$options:'i'}}];
  const premium=Boolean(req.user && await Subscription.exists({userId:req.user.id,plan:'premium',status:{$in:['active','trialing']}}));
  const query=Prediction.find(filter)
    .select('tipsterId matchId fixture league prediction odds isPremium confidence analysis status profit publishedAt resultAt createdAt systemGenerated source modelVersion modelScore expectedValue modelAgreement horizon oddsSource')
    .populate('tipsterId','name')
    .populate({path:'matchId',select:'kickoff status homeScore awayScore homeTeamId awayTeamId leagueId',populate:[
      {path:'homeTeamId',select:'name shortName logo'},
      {path:'awayTeamId',select:'name shortName logo'},
      {path:'leagueId',select:'name logo'}
    ]})
    .sort({publishedAt:-1,createdAt:-1}).skip((page-1)*limit).limit(limit).lean();
  const [rows,total]=await Promise.all([query,Prediction.countDocuments(filter)]);
  const data=rows.map((p:any)=>p.isPremium && !premium ? {...p,prediction:undefined,odds:undefined,confidence:undefined,analysis:undefined,modelScore:undefined,expectedValue:undefined,locked:true,lockReason:'Premium subscription required'} : {...p,locked:false});
  res.json({data,premium,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
}catch(e){next(e)}});
publicRouter.get("/predictions/:id", optionalAuth, async(req:AuthRequest,res,next)=>{try{
  const item:any=await Prediction.findOne({_id:req.params.id,status:{ $in:["published","won","lost","void"]}})
    .populate('tipsterId','name')
    .populate({path:'matchId',populate:[
      {path:'homeTeamId',select:'name shortName logo externalId'},
      {path:'awayTeamId',select:'name shortName logo externalId'},
      {path:'leagueId',select:'name logo country'},
      {path:'seasonId',select:'name externalId'}
    ]});
  if(!item)return res.status(404).json({message:'Prediction not found'});
  const premium=Boolean(req.user && await Subscription.exists({userId:req.user.id,plan:'premium',status:{$in:['active','trialing']}}));
  const data=item.toObject();
  if(data.isPremium && !premium){ delete data.prediction; delete data.odds; delete data.confidence; delete data.analysis; delete data.modelScore; delete data.expectedValue; data.locked=true; data.lockReason='Premium subscription required'; }
  res.json({data,premium});
}catch(e){next(e)}});
publicRouter.get("/prediction-trends", async (req,res,next)=>{
  try {
    const rawDays=Number(req.query.days||365);
    const days=Number.isFinite(rawDays)?Math.min(Math.max(Math.floor(rawDays),7),365):365;
    const end=new Date(); end.setUTCHours(23,59,59,999);
    const start=new Date(end); start.setUTCDate(start.getUTCDate()-(days-1)); start.setUTCHours(0,0,0,0);
    const match={status:{$in:['won','lost'] as string[]},resultAt:{$gte:start,$lte:end}};
    const [summaryRows, markets, dailyRows, distributionRows]=await Promise.all([
      Prediction.aggregate([
        {$match:match},
        {$group:{_id:null,tips:{$sum:1},wins:{$sum:{$cond:[{$eq:['$status','won']},1,0]}},profit:{$sum:{$ifNull:['$profit',0]}},oddsSum:{$sum:{$ifNull:['$odds',0]}}}},
        {$project:{_id:0,tips:1,wins:1,profit:1,avgOdds:{$cond:[{$gt:['$tips',0]},{$divide:['$oddsSum','$tips']},0]},winRate:{$cond:[{$gt:['$tips',0]},{$multiply:[{$divide:['$wins','$tips']},100]},0]}}}
      ]),
      Prediction.aggregate([
        {$match:match},
        {$group:{_id:'$prediction',tips:{$sum:1},wins:{$sum:{$cond:[{$eq:['$status','won']},1,0]}},profit:{$sum:{$ifNull:['$profit',0]}},oddsSum:{$sum:{$ifNull:['$odds',0]}}}},
        {$project:{_id:1,tips:1,wins:1,profit:1,avgOdds:{$cond:[{$gt:['$tips',0]},{$divide:['$oddsSum','$tips']},0]},winRate:{$cond:[{$gt:['$tips',0]},{$multiply:[{$divide:['$wins','$tips']},100]},0]}}},
        {$sort:{profit:-1,tips:-1}}
      ]),
      Prediction.aggregate([
        {$match:match},
        {$group:{_id:{$dateToString:{format:'%Y-%m-%d',date:'$resultAt'}},tips:{$sum:1},wins:{$sum:{$cond:[{$eq:['$status','won']},1,0]}},profit:{$sum:{$ifNull:['$profit',0]}}}},
        {$sort:{_id:1}}
      ]),
      Prediction.aggregate([
        {$match:match},
        {$group:{_id:'$prediction',tips:{$sum:1}}},
        {$sort:{tips:-1}}
      ])
    ]);
    const summary=summaryRows[0]||{tips:0,wins:0,profit:0,avgOdds:0,winRate:0};
    const totalTips=Number(summary.tips||0);
    const dailyByDate=new Map(dailyRows.map((r:any)=>[r._id,r]));
    const daily=[];
    for(let i=0;i<days;i++){
      const d=new Date(start); d.setUTCDate(start.getUTCDate()+i); const key=d.toISOString().slice(0,10); const r=dailyByDate.get(key);
      daily.push({date:key,tips:Number(r?.tips||0),wins:Number(r?.wins||0),profit:Number(r?.profit||0),winRate:r?.tips?Number(r.wins||0)/Number(r.tips)*100:0});
    }
    const data={
      rangeDays:days,start:start.toISOString(),end:end.toISOString(),
      summary:{tips:totalTips,wins:Number(summary.wins||0),winRate:Number(summary.winRate||0),profit:Number(summary.profit||0),avgOdds:Number(summary.avgOdds||0)},
      markets:markets.map((m:any)=>({market:m._id||'Other',tips:Number(m.tips||0),wins:Number(m.wins||0),winRate:Number(m.winRate||0),profit:Number(m.profit||0),avgOdds:Number(m.avgOdds||0)})),
      distribution:distributionRows.map((m:any)=>({market:m._id||'Other',tips:Number(m.tips||0),percentage:totalTips?Number(m.tips||0)/totalTips*100:0})),
      daily,
    };
    res.json({data});
  } catch(e){next(e)}
});

publicRouter.get("/prediction-history",optionalAuth,async(req:AuthRequest,res,next)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||50,1),200);const filter:any={status:{ $in:["won","lost","void"]}};const premium=Boolean(req.user && await Subscription.exists({userId:req.user.id,plan:'premium',status:{$in:['active','trialing']}}));const [rows,stats]=await Promise.all([Prediction.find(filter).populate('tipsterId','name').populate({path:'matchId',populate:[{path:'homeTeamId',select:'name shortName logo'},{path:'awayTeamId',select:'name shortName logo'},{path:'leagueId',select:'name logo'}]}).sort({resultAt:-1,createdAt:-1}).limit(limit),Prediction.aggregate([{$match:filter},{$group:{_id:null,total:{$sum:1},wins:{$sum:{$cond:[{$eq:['$status','won']},1,0]}},profit:{$sum:{$ifNull:['$profit',0]}}}},{$project:{_id:0,total:1,wins:1,profit:1,winRate:{$cond:[{$gt:['$total',0]},{$multiply:[{$divide:['$wins','$total']},100]},0]}}}])]);const data=rows.map((p:any)=>p.isPremium&&!premium?{...p.toObject?.()||p,prediction:undefined,odds:undefined,confidence:undefined,analysis:undefined,locked:true,lockReason:'Premium subscription required'}:{...p.toObject?.()||p,locked:false});res.json({data,stats:stats[0]||{total:0,wins:0,profit:0,winRate:0},premium});}catch(e){next(e)}});
publicRouter.get("/bet-of-day/recent",async(req,res,next)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||50,1),100);const data=await BetOfDay.find({status:{ $in:["won","lost","void"]}}).populate({path:'matchId',select:'kickoff status homeScore awayScore homeTeamId awayTeamId leagueId',populate:[{path:'homeTeamId',select:'name shortName logo'},{path:'awayTeamId',select:'name shortName logo'},{path:'leagueId',select:'name logo'}]}).sort({date:-1,createdAt:-1}).limit(limit);res.json({data});}catch(e){next(e)}});
publicRouter.get("/bet-of-day",async(req,res,next)=>{try{const date=typeof req.query.date==='string'?req.query.date:new Date().toISOString().slice(0,10);const data=await BetOfDay.find({date,status:{ $in:["published","won","lost","void"]}}).populate({path:'matchId',populate:[{path:'homeTeamId',select:'name logo'},{path:'awayTeamId',select:'name logo'},{path:'leagueId',select:'name logo'}]}).sort({createdAt:1});res.json({data});}catch(e){next(e)}});
