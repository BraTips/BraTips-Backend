import { Router } from "express";
import { League } from "../models/League";
import { Season } from "../models/Season";
import { Team } from "../models/Team";
import { Match } from "../models/Match";
export const publicRouter = Router();

publicRouter.get("/leagues", async (_req,res)=>res.json({data: await League.find({active:true}).sort({name:1})}));
publicRouter.get("/leagues/:id", async (req,res)=>{ const x=await League.findById(req.params.id); if(!x)return res.status(404).json({message:"League not found"}); res.json({data:x}); });
publicRouter.get("/teams", async (_req,res)=>res.json({data: await Team.find({active:true}).sort({name:1})}));
publicRouter.get("/teams/:id", async (req,res)=>{ const x=await Team.findById(req.params.id); if(!x)return res.status(404).json({message:"Team not found"}); res.json({data:x}); });
publicRouter.get("/matches", async (req,res)=>{
  const filter:any={}; if(typeof req.query.status==="string")filter.status=req.query.status;
  if(typeof req.query.leagueId==="string")filter.leagueId=req.query.leagueId;
  const page=Math.max(Number(req.query.page)||1,1), limit=Math.min(Math.max(Number(req.query.limit)||50,1),100);
  const [data,total]=await Promise.all([
    Match.find(filter).populate("leagueId","name country logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo").sort({kickoff:1}).skip((page-1)*limit).limit(limit),
    Match.countDocuments(filter)
  ]);
  res.json({data,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});
});
publicRouter.get("/matches/today", async (_req,res)=>{
  const start=new Date();start.setUTCHours(0,0,0,0);const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
  res.json({data:await Match.find({kickoff:{$gte:start,$lt:end}}).populate("leagueId","name country").populate("homeTeamId","name logo").populate("awayTeamId","name logo").sort({kickoff:1})});
});
publicRouter.get("/matches/live", async (_req,res)=>res.json({data:await Match.find({status:"live"}).populate("leagueId","name").populate("homeTeamId","name logo").populate("awayTeamId","name logo").sort({kickoff:1})}));
publicRouter.get("/matches/:id", async (req,res)=>{const x=await Match.findById(req.params.id).populate("leagueId","name country logo").populate("homeTeamId","name shortName logo").populate("awayTeamId","name shortName logo");if(!x)return res.status(404).json({message:"Match not found"});res.json({data:x});});
import { Prediction } from "../models/Prediction";
import { TipsterProfile } from "../models/TipsterProfile";
import { BetOfDay } from "../models/BetOfDay";

publicRouter.get("/tipsters", async (_req,res,next)=>{try{const data=await TipsterProfile.find({active:true}).sort({wins:-1,roi:-1}).limit(100).select("username bio country expertise profilePhoto totalTips wins losses profit roi currentStreak longestStreak totalRewardsPaid");res.json({data});}catch(e){next(e)}});
publicRouter.get("/tipsters/:username", async(req,res,next)=>{try{const profile=await TipsterProfile.findOne({username:req.params.username,active:true}).select("userId username bio country expertise profilePhoto totalTips wins losses profit roi currentStreak longestStreak");if(!profile)return res.status(404).json({message:"Tipster not found"});const predictions=await Prediction.find({tipsterId:profile.userId,status:{ $in:["published","won","lost","void"]}}).populate({path:'matchId',populate:[{path:'homeTeamId',select:'name shortName logo'},{path:'awayTeamId',select:'name shortName logo'},{path:'leagueId',select:'name logo'}]}).sort({publishedAt:-1,createdAt:-1}).limit(100);res.json({data:{profile,predictions}});}catch(e){next(e)}});
publicRouter.get("/predictions", async(req,res,next)=>{try{const page=Math.max(Number(req.query.page)||1,1),limit=Math.min(Math.max(Number(req.query.limit)||30,1),100);const search=typeof req.query.search==='string'?req.query.search.trim():'';const filter:any={status:{ $in:["published","won","lost","void"]}};if(search)filter.$or=[{fixture:{$regex:search,$options:'i'}},{league:{$regex:search,$options:'i'}},{prediction:{$regex:search,$options:'i'}}];const [data,total]=await Promise.all([Prediction.find(filter).populate('tipsterId','name').populate({path:'matchId',populate:[{path:'homeTeamId',select:'name logo'},{path:'awayTeamId',select:'name logo'},{path:'leagueId',select:'name logo'}]}).sort({publishedAt:-1,createdAt:-1}).skip((page-1)*limit).limit(limit),Prediction.countDocuments(filter)]);res.json({data,pagination:{page,limit,total,pages:Math.ceil(total/limit)}});}catch(e){next(e)}});
publicRouter.get("/predictions/:id",async(req,res,next)=>{try{const item=await Prediction.findOne({_id:req.params.id,status:{ $in:["published","won","lost","void"]}}).populate('tipsterId','name').populate('matchId');if(!item)return res.status(404).json({message:'Prediction not found'});res.json({data:item});}catch(e){next(e)}});
publicRouter.get("/prediction-history",async(req,res,next)=>{try{const limit=Math.min(Math.max(Number(req.query.limit)||50,1),200);const filter:any={status:{ $in:["won","lost","void"]}};const [data,stats]=await Promise.all([Prediction.find(filter).populate('tipsterId','name').sort({resultAt:-1,createdAt:-1}).limit(limit),Prediction.aggregate([{$match:filter},{$group:{_id:null,total:{$sum:1},wins:{$sum:{$cond:[{$eq:['$status','won']},1,0]}},profit:{$sum:{$ifNull:['$profit',0]}}}},{$project:{_id:0,total:1,wins:1,profit:1,winRate:{$cond:[{$gt:['$total',0]},{$multiply:[{$divide:['$wins','$total']},100]},0]}}}])]);res.json({data,stats:stats[0]||{total:0,wins:0,profit:0,winRate:0}});}catch(e){next(e)}});
publicRouter.get("/bet-of-day",async(req,res,next)=>{try{const date=typeof req.query.date==='string'?req.query.date:new Date().toISOString().slice(0,10);const data=await BetOfDay.find({date,status:{ $in:["published","won","lost","void"]}}).populate({path:'matchId',populate:[{path:'homeTeamId',select:'name logo'},{path:'awayTeamId',select:'name logo'},{path:'leagueId',select:'name logo'}]}).sort({createdAt:1});res.json({data});}catch(e){next(e)}});
