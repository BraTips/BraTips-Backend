import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { BetOfDay } from '../models/BetOfDay';
import { UserPick } from '../models/UserPick';
import { TipsterFollow } from '../models/TipsterFollow';
import { notifyMany } from './notificationService';
import { settlePredictionRewards } from './rewardService';

export type Evaluation='won'|'lost'|'void'|null;

function score(match:any){ return {home:Number(match.homeScore||0),away:Number(match.awayScore||0)}; }
export function evaluateMarket(prediction:string, match:any):Evaluation{
  const text=prediction.trim().toLowerCase().replace(/\s+/g,' ');
  const {home,away}=score(match);
  if(!['finished'].includes(String(match.status))) return null;
  if(/double\s*chance/.test(text) || /\b(1x|x2|12)\b/.test(text)){
    const token=(text.match(/\b(1x|x2|12)\b/)||[])[1];
    if(!token) return 'void';
    if(token==='1x') return home>=away?'won':'lost';
    if(token==='x2') return away>=home?'won':'lost';
    return home!==away?'won':'lost';
  }
  if(/both teams.*score|btts|both to score/.test(text)) return home>0&&away>0?'won':'lost';
  const over=text.match(/over\s*(\d+(?:\.\d+)?)/); if(over){return home+away>Number(over[1])?'won':'lost';}
  const under=text.match(/under\s*(\d+(?:\.\d+)?)/); if(under){return home+away<Number(under[1])?'won':'lost';}
  if(/draw|tie/.test(text) && !/double/.test(text)) return home===away?'won':'lost';
  if(/away\s*(win|to win)|\b2\b/.test(text) && !/1x|x2|12/.test(text)) return away>home?'won':'lost';
  if(/home\s*(win|to win)|\b1\b/.test(text) && !/1x|x2|12/.test(text)) return home>away?'won':'lost';
  return null;
}

async function settlePrediction(p:any, status:Exclude<Evaluation,null>){
  if(p.status!== 'published') return;
  p.status=status; p.resultAt=new Date();
  p.profit=status==='won'?Number((Math.max(0,Number(p.odds||1)-1)).toFixed(2)):-1;
  await p.save();
  await settlePredictionRewards(String(p._id));
  const picks=await UserPick.find({predictionId:p._id,status:'open'});
  await UserPick.updateMany({predictionId:p._id,status:'open'},{$set:{status}});
  await notifyMany(picks.map(x=>x.userId),{type:'result',title:`Your pick is ${status.toUpperCase()}`,message:`${p.fixture}: ${p.prediction} was settled as ${status}.`,link:'/dashboard'});
  const followers=p.tipsterId ? await TipsterFollow.find({tipsterId:p.tipsterId}).select('userId') : [];
  await notifyMany(followers.map(x=>x.userId),{type:'result',title:`Prediction ${status.toUpperCase()}`,message:`${p.fixture}: ${p.prediction} was settled as ${status}.`,link:'/history'});
}

async function settleBetOfDay(item:any, status:Exclude<Evaluation,null>){ item.status=status; item.result=status; await item.save(); }

export async function settleFinishedResults(){
  const matches=await Match.find({status:'finished'}).sort({updatedAt:-1}).limit(500);
  let predictions=0,bets=0;
  for(const match of matches){
    const ps=await Prediction.find({matchId:match._id,status:'published'});
    for(const p of ps){ const result=evaluateMarket(p.prediction,match); if(result) { await settlePrediction(p,result); predictions++; } }
    const bod=await BetOfDay.find({matchId:match._id,status:'published'});
    for(const b of bod){ const result=evaluateMarket(b.prediction,match); if(result){await settleBetOfDay(b,result);bets++;} }
  }
  return {predictions,bets};
}
