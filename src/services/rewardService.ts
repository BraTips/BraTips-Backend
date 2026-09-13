import { Prediction } from '../models/Prediction';
import { TipsterProfile } from '../models/TipsterProfile';
import { RewardRule } from '../models/RewardRule';
import { RewardLedger } from '../models/RewardLedger';
import { UserPick } from '../models/UserPick';

export async function settlePredictionRewards(predictionId:string) {
  const prediction=await Prediction.findById(predictionId);
  if(!prediction || !['won','lost','void'].includes(prediction.status)) return null;
  const profile=await TipsterProfile.findOne({userId:prediction.tipsterId});
  if(!profile) return null;
  const settled=await Prediction.find({tipsterId:prediction.tipsterId,status:{$in:['won','lost','void']},resultAt:{$ne:null}}).sort({resultAt:1,createdAt:1});
  let streak=0,longest=0;
  for(const p of settled){
    if(p.status==='won') streak+=1; else streak=0;
    longest=Math.max(longest,streak);
    await Prediction.updateOne({_id:p._id},{$set:{currentStreak:streak}});
  }
  profile.currentStreak=streak; profile.longestStreak=Math.max(profile.longestStreak||0,longest);
  profile.totalTips=settled.length; profile.wins=settled.filter(p=>p.status==='won').length; profile.losses=settled.filter(p=>p.status==='lost').length;
  profile.profit=settled.reduce((sum:number,p:any)=>sum+(Number(p.profit)||0),0); profile.roi=profile.totalTips?Number(((profile.profit/profile.totalTips)*100).toFixed(2)):0;
  let rewardCount=0;
  await UserPick.updateMany({predictionId:prediction._id,status:'open'},{$set:{status:prediction.status==='won'?'won':prediction.status==='lost'?'lost':'void'}});
  if(prediction.status==='won'){
    const rules=await RewardRule.find({active:true,streak:{$lte:streak}}).sort({streak:-1});
    for(const rule of rules){
      const r=await RewardLedger.updateOne({predictionId:prediction._id,ruleId:rule._id},{$setOnInsert:{tipsterId:profile._id,predictionId:prediction._id,ruleId:rule._id,streak,amount:rule.amount,currency:rule.currency,status:'pending'}},{upsert:true});
      rewardCount+=r.upsertedCount;
    }
  }
  const earned=await RewardLedger.aggregate([{$match:{tipsterId:profile._id,status:{$in:['pending','approved','paid']}}},{$group:{_id:null,total:{$sum:'$amount'}}}]);
  const paid=await RewardLedger.aggregate([{$match:{tipsterId:profile._id,status:'paid'}},{$group:{_id:null,total:{$sum:'$amount'}}}]);
  profile.totalRewardsEarned=earned[0]?.total||0; profile.totalRewardsPaid=paid[0]?.total||0; await profile.save();
  return {streak,longestStreak:profile.longestStreak,rewardsCreated:rewardCount};
}

export async function settleAllRewards(){
  const ids=await Prediction.find({status:{$in:['won','lost','void']},resultAt:{$ne:null}}).distinct('_id');
  for(const id of ids) await settlePredictionRewards(String(id));
}
