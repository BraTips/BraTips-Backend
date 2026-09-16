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
  const text=prediction.trim().toLowerCase().replace(/[\u2013\u2014]/g,'-').replace(/\s+/g,' ');
  const {home,away}=score(match);
  const total=home+away;
  if(!['finished'].includes(String(match.status))) return null;
  const correct=text.match(/correct score\s*(\d+)\s*[-:]\s*(\d+)/);
  if(correct) return home===Number(correct[1]) && away===Number(correct[2]) ? 'won' : 'lost';
  if(/draw no bet|dnb/.test(text)){
    if(home===away) return 'void';
    if(/home|\b1\b/.test(text)) return home>away?'won':'lost';
    if(/away|\b2\b/.test(text)) return away>home?'won':'lost';
    return null;
  }
  if(/double\s*chance/.test(text) || /\b(1x|x2|12)\b/.test(text)){
    const token=(text.match(/\b(1x|x2|12)\b/)||[])[1];
    if(!token) return 'void';
    if(token==='1x') return home>=away?'won':'lost';
    if(token==='x2') return away>=home?'won':'lost';
    return home!==away?'won':'lost';
  }
  if(/btts|both teams.*score|both to score/.test(text)){
    const btts=home>0&&away>0;
    if(/\+\s*home win|home win/.test(text)) return btts&&home>away?'won':'lost';
    if(/\+\s*away win|away win/.test(text)) return btts&&away>home?'won':'lost';
    if(/\+\s*draw|draw/.test(text)) return btts&&home===away?'won':'lost';
    const bttsOver=text.match(/over\s*(\d+(?:\.\d+)?)/); if(bttsOver) return btts&&total>Number(bttsOver[1])?'won':'lost';
    const bttsUnder=text.match(/under\s*(\d+(?:\.\d+)?)/); if(bttsUnder) return btts&&total<Number(bttsUnder[1])?'won':'lost';
    if(/\bno\b/.test(text)) return !btts?'won':'lost';
    return btts?'won':'lost';
  }
  if(/home clean sheet/.test(text)) return away===0?'won':'lost';
  if(/away clean sheet/.test(text)) return home===0?'won':'lost';
  if(/home team to score|home to score/.test(text)) return home>0?'won':'lost';
  if(/away team to score|away to score/.test(text)) return away>0?'won':'lost';
  const homeLine=text.match(/home\s+(over|under)\s*(\d+(?:\.\d+)?)/);
  if(homeLine) return homeLine[1]==='over' ? home>Number(homeLine[2])?'won':'lost' : home<Number(homeLine[2])?'won':'lost';
  const awayLine=text.match(/away\s+(over|under)\s*(\d+(?:\.\d+)?)/);
  if(awayLine) return awayLine[1]==='over' ? away>Number(awayLine[2])?'won':'lost' : away<Number(awayLine[2])?'won':'lost';
  const over=text.match(/over\s*(\d+(?:\.\d+)?)/); if(over){return total>Number(over[1])?'won':'lost';}
  const under=text.match(/under\s*(\d+(?:\.\d+)?)/); if(under){return total<Number(under[1])?'won':'lost';}
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
