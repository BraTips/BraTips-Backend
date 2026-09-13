import { Match } from '../models/Match';
import { Prediction } from '../models/Prediction';
import { BetOfDay } from '../models/BetOfDay';

function norm(value:any){ return String(value||'').trim().toLowerCase().replace(/[–—]/g,'-'); }
function resultFor(prediction:string, home:number, away:number): 'won'|'lost'|null {
  const p=norm(prediction).replace(/\s+/g,' ');
  const total=home+away;
  if(/double\s*chance.*\b1x\b|\b1x\b/.test(p)) return home>=away?'won':'lost';
  if(/double\s*chance.*\bx2\b|\bx2\b/.test(p)) return away>=home?'won':'lost';
  if(/double\s*chance.*\b12\b|\b12\b/.test(p)) return home!==away?'won':'lost';
  if(/both teams.*yes|btts.*yes|gg|both to score/.test(p)) return home>0&&away>0?'won':'lost';
  if(/both teams.*no|btts.*no|ng/.test(p)) return home===0||away===0?'won':'lost';
  const over=p.match(/over\s*(\d+(?:\.\d+)?)/); if(over) return total>Number(over[1])?'won':'lost';
  const under=p.match(/under\s*(\d+(?:\.\d+)?)/); if(under) return total<Number(under[1])?'won':'lost';
  if(/draw|\b1?x\b/.test(p) && !/1x/.test(p)) return home===away?'won':'lost';
  if(/away win|away to win|\b2\b/.test(p) && !/x2/.test(p)) return away>home?'won':'lost';
  if(/home win|home to win|\b1\b/.test(p) && !/1x/.test(p)) return home>away?'won':'lost';
  return null;
}

export function settleStatus(prediction:string, home:number, away:number){ return resultFor(prediction,home,away); }

export async function settleFinishedMatches(){
  const matches=await Match.find({status:'finished'}).select('_id homeScore awayScore');
  let settled=0;
  for(const match of matches){
    const predictions=await Prediction.find({matchId:match._id,status:'published'});
    for(const p of predictions){ const result=resultFor(p.prediction,match.homeScore,match.awayScore); if(result){ p.status=result; p.resultAt=new Date(); await p.save(); settled++; } }
    const bets=await BetOfDay.find({matchId:match._id,status:'published'});
    for(const b of bets){ const result=resultFor(b.prediction,match.homeScore,match.awayScore); if(result){ b.status=result; b.result=result; await b.save(); settled++; } }
  }
  return settled;
}
