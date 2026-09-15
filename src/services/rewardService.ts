import { sendWithdrawalEmail } from './emailService';
import { Prediction } from '../models/Prediction';
import { TipsterProfile } from '../models/TipsterProfile';
import { TipsterReward } from '../models/TipsterReward';
import { RewardPeriod } from '../models/RewardPeriod';
import { TipsterWallet } from '../models/TipsterWallet';
import { WalletTransaction } from '../models/WalletTransaction';
import { WithdrawalRequest } from '../models/WithdrawalRequest';
import { SubscriptionRevenue } from '../models/SubscriptionRevenue';
import { UserPick } from '../models/UserPick';
import { RewardSettings } from '../models/RewardSettings';
import { env } from '../config/env';
import mongoose from 'mongoose';

export const TIPSTER_POOL_PERCENT = 30;
export const PLATFORM_SHARE_PERCENT = 70;
export const MIN_SETTLED_PREDICTIONS = 50;
export const MIN_WITHDRAWAL = 10;

export async function getRewardSettings(){
  const currency=String(env.TIPSTER_REWARD_CURRENCY||env.STRIPE_CURRENCY||'USD').toUpperCase();
  return RewardSettings.findOneAndUpdate({singletonKey:'default'},{$set:{currency},$setOnInsert:{singletonKey:'default',platformSharePercent:PLATFORM_SHARE_PERCENT,tipsterPoolPercent:TIPSTER_POOL_PERCENT,minSettledPredictions:MIN_SETTLED_PREDICTIONS,minMonthlySettledPredictions:5,minWithdrawal:MIN_WITHDRAWAL}},{upsert:true,new:true,setDefaultsOnInsert:true});
}

function round2(value:number){ return Math.round(value * 100) / 100; }
function clamp(value:number,min:number,max:number){ return Math.max(min,Math.min(max,value)); }
function monthBounds(key:string){
  const [y,m]=key.split('-').map(Number);
  if(!y || !m || m<1 || m>12) throw new Error('Invalid reward month. Use YYYY-MM.');
  const start=new Date(Date.UTC(y,m-1,1));
  const end=new Date(Date.UTC(y,m,1));
  const label=start.toLocaleDateString('en-US',{month:'long',year:'numeric',timeZone:'UTC'});
  return {start,end,label};
}
export function currentMonthKey(d=new Date()){ return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; }

export async function recordSubscriptionRevenue(input:{invoiceId:string;customerId?:string;subscriptionId?:string;amount:number;currency:string;paidAt?:Date;periodStart?:Date;periodEnd?:Date}){
  if(!input.invoiceId || input.amount<=0) return null;
  const subscription=input.subscriptionId ? await (await import('../models/Subscription')).Subscription.findOne({stripeSubscriptionId:input.subscriptionId}) : null;
  const userId=subscription?.userId;
  return SubscriptionRevenue.findOneAndUpdate(
    {invoiceId:input.invoiceId},
    {$setOnInsert:{invoiceId:input.invoiceId,subscriptionId:subscription?._id,userId,stripeCustomerId:input.customerId,stripeSubscriptionId:input.subscriptionId,amount:round2(input.amount),refundedAmount:0,currency:String(input.currency||env.TIPSTER_REWARD_CURRENCY||'USD').toUpperCase(),status:'paid',paidAt:input.paidAt||new Date(),periodStart:input.periodStart,periodEnd:input.periodEnd}},
    {upsert:true,new:true,setDefaultsOnInsert:true}
  );
}

function scoreTipster(rows:any[],monthlyRows:any[]){
  const settled=rows.length; const monthlySettled=monthlyRows.length;
  const wins=rows.filter(p=>p.status==='won').length;
  const losses=rows.filter(p=>p.status==='lost').length;
  const voids=rows.filter(p=>p.status==='void').length;
  const decided=wins+losses;
  const winRate=decided?wins/decided:0;
  const profit=rows.reduce((s,p)=>s+(Number(p.profit)||0),0);
  const roi=settled?profit/settled*100:0;
  let current=0,longest=0;
  for(const p of rows){ if(p.status==='won') current++; else current=0; longest=Math.max(longest,current); }
  // 40% long-term win rate, 25% volume, 15% consistency, 10% ROI, 10% discipline/quality.
  const winRateScore=clamp(winRate,0,1);
  const volumeScore=clamp(monthlySettled/20,0,1);
  const consistencyScore=clamp(longest/10,0,1);
  const roiScore=clamp((roi+10)/40,0,1);
  const qualityScore=clamp(1-(voids/Math.max(settled,1)),0,1);
  const performanceScore=(winRateScore*.40)+(volumeScore*.25)+(consistencyScore*.15)+(roiScore*.10)+(qualityScore*.10);
  return {settled,monthlySettled,wins,losses,voids,winRate:round2(winRate*100),roi:round2(roi),longestStreak:longest,winRateScore,volumeScore,consistencyScore,roiScore,qualityScore,performanceScore};
}

export async function calculateRewardPeriod(key:string, options?:{poolPercent?:number;platformPercent?:number}){
  const {start,end,label}=monthBounds(key);
  const settings=await getRewardSettings();
  const poolPercent=options?.poolPercent ?? settings.tipsterPoolPercent;
  const platformPercent=options?.platformPercent ?? settings.platformSharePercent;
  if(poolPercent+platformPercent!==100) throw new Error('Platform share and tipster pool must total 100%.');
  const revenueByCurrency=await SubscriptionRevenue.aggregate([
    {$match:{status:'paid',paidAt:{$gte:start,$lt:end}}},
    {$group:{_id:'$currency',amount:{$sum:'$amount'}}}
  ]);
  if(revenueByCurrency.length>1) throw new Error('Reward calculation requires a single subscription currency for the period.');
  const currency=String(revenueByCurrency[0]?._id||settings.currency||env.TIPSTER_REWARD_CURRENCY||'USD').toUpperCase();
  const configuredCurrency=String(settings.currency||env.TIPSTER_REWARD_CURRENCY||env.STRIPE_CURRENCY||'USD').toUpperCase();
  if(revenueByCurrency.length && currency!==configuredCurrency) throw new Error(`Subscription currency ${currency} does not match tipster reward currency ${configuredCurrency}. Set Stripe Prices and TIPSTER_REWARD_CURRENCY to the same settlement currency.`);
  const grossRevenue=round2(revenueByCurrency.filter(x=>String(x._id).toUpperCase()===currency).reduce((s,x)=>s+Number(x.amount||0),0));
  const period=await RewardPeriod.findOneAndUpdate({key},{$setOnInsert:{key,label,startDate:start,endDate:end,currency,platformSharePercent:platformPercent,tipsterPoolPercent:poolPercent}}, {upsert:true,new:true,setDefaultsOnInsert:true});
  if(period.status==='approved' || period.status==='paid') throw new Error(`Reward period ${key} is already approved/paid and cannot be recalculated.`);
  const lockedReward=await TipsterReward.exists({periodId:period._id,status:{$in:['approved','paid']}});
  if(lockedReward) throw new Error(`Reward period ${key} contains approved/paid rewards and cannot be recalculated.`);
  period.currency=currency; period.grossRevenue=grossRevenue; period.platformSharePercent=platformPercent; period.tipsterPoolPercent=poolPercent;
  period.tipsterPoolAmount=round2(grossRevenue*poolPercent/100); period.platformRevenueAmount=round2(grossRevenue*platformPercent/100);

  const profiles=await TipsterProfile.find({active:true}).select('_id userId');
  const scored:any[]=[];
  for(const profile of profiles){
    const [predictions,monthlyPredictions]=await Promise.all([
      Prediction.find({tipsterId:profile.userId,status:{$in:['won','lost','void']},resultAt:{$ne:null}}).sort({resultAt:1,createdAt:1}).lean(),
      Prediction.find({tipsterId:profile.userId,status:{$in:['won','lost','void']},resultAt:{$gte:start,$lt:end}}).sort({resultAt:1,createdAt:1}).lean()
    ]);
    const stats=scoreTipster(predictions,monthlyPredictions);
    if(stats.settled<settings.minSettledPredictions || stats.monthlySettled<settings.minMonthlySettledPredictions) continue;
    scored.push({profile,stats});
  }
  const totalScore=scored.reduce((s,x)=>s+x.stats.performanceScore,0);
  await TipsterReward.deleteMany({periodId:period._id,status:'pending'});
  let allocated=0;
  if(totalScore>0 && period.tipsterPoolAmount>0){
    for(let i=0;i<scored.length;i++){
      const x=scored[i];
      const share=i===scored.length-1 ? round2(period.tipsterPoolAmount-allocated) : round2(period.tipsterPoolAmount*x.stats.performanceScore/totalScore);
      allocated=round2(allocated+share);
      await TipsterReward.findOneAndUpdate({periodId:period._id,tipsterId:x.profile._id},{$set:{settledPredictions:x.stats.settled,monthlySettledPredictions:x.stats.monthlySettled,wins:x.stats.wins,losses:x.stats.losses,voids:x.stats.voids,winRate:x.stats.winRate,roi:x.stats.roi,longestStreak:x.stats.longestStreak,winRateScore:x.stats.winRateScore,volumeScore:x.stats.volumeScore,consistencyScore:x.stats.consistencyScore,roiScore:x.stats.roiScore,qualityScore:x.stats.qualityScore,performanceScore:x.stats.performanceScore,sharePercent:round2(x.stats.performanceScore/totalScore*100),amount:share,currency:currency,status:'pending'}},{upsert:true,new:true,setDefaultsOnInsert:true});
    }
  }
  period.allocatedAmount=allocated; period.status='calculated'; period.calculatedAt=new Date(); await period.save();
  return {period,eligibleTipsters:scored.length,totalPerformanceScore:round2(totalScore),allocatedAmount:allocated};
}

export async function approveReward(rewardId:string){
  const session=await mongoose.startSession();
  try {
    let reward:any;
    await session.withTransaction(async()=>{
      reward=await TipsterReward.findById(rewardId).session(session);
      if(!reward) throw new Error('Reward not found');
      if(reward.status!=='pending') return;
      const wallet=await TipsterWallet.findOneAndUpdate({tipsterId:reward.tipsterId},{$setOnInsert:{tipsterId:reward.tipsterId,currency:reward.currency}},{upsert:true,new:true,setDefaultsOnInsert:true,session});
      if(!wallet) throw new Error('Unable to create tipster wallet.');
      if(String(wallet.currency).toUpperCase()!==String(reward.currency).toUpperCase()) throw new Error(`Wallet currency ${wallet.currency} does not match reward currency ${reward.currency}.`);
      const txRef=`reward:${reward._id}:credit`;
      const existingTx=await WalletTransaction.findOne({reference:txRef}).session(session);
      if(!existingTx){
        await WalletTransaction.create([{tipsterId:reward.tipsterId,walletId:wallet._id,type:'PERFORMANCE_REWARD',amount:reward.amount,currency:reward.currency,status:'pending',reference:txRef,rewardId:reward._id,description:`Performance reward for ${reward.periodId}`}],{session});
        await TipsterWallet.updateOne({_id:wallet._id},{$inc:{pendingBalance:reward.amount,lifetimeEarned:reward.amount}},{session});
        await TipsterProfile.updateOne({_id:reward.tipsterId},{$inc:{totalRewardsEarned:reward.amount}},{session});
      }
      reward.status='approved'; reward.approvedAt=new Date(); await reward.save({session});
    });
    return reward;
  } finally { await session.endSession(); }
}

export async function makeRewardAvailable(rewardId:string){
  const session=await mongoose.startSession();
  try {
    let reward:any;
    await session.withTransaction(async()=>{
      reward=await TipsterReward.findById(rewardId).session(session); if(!reward) throw new Error('Reward not found');
      if(reward.status!=='approved') throw new Error('Reward must be approved before it becomes available.');
      const wallet=await TipsterWallet.findOne({tipsterId:reward.tipsterId}).session(session); if(!wallet) throw new Error('Tipster wallet not found');
      if(String(wallet.currency).toUpperCase()!==String(reward.currency).toUpperCase()) throw new Error(`Wallet currency ${wallet.currency} does not match reward currency ${reward.currency}.`);
      const tx=await WalletTransaction.findOne({reference:`reward:${reward._id}:credit`}).session(session);
      if(!tx) throw new Error('Reward wallet transaction not found.');
      if(tx.status==='pending'){
        const moved=await TipsterWallet.updateOne({_id:wallet._id,pendingBalance:{$gte:reward.amount}},{$inc:{pendingBalance:-reward.amount,availableBalance:reward.amount}},{session});
        if(moved.modifiedCount!==1) throw new Error('Reward pending balance is inconsistent.');
        tx.status='available'; await tx.save({session});
      } else if(tx.status!=='available') throw new Error(`Reward transaction is ${tx.status} and cannot be made available.`);
    });
    return reward;
  } finally { await session.endSession(); }
}

export async function requestWithdrawal(tipsterUserId:string, amount:number, method:'mobile_money'|'bank_transfer', payoutDetails:{accountName:string;accountNumber:string;institution:string}, note?:string){
  const profile=await TipsterProfile.findOne({userId:tipsterUserId,active:true}); if(!profile) throw new Error('Active tipster profile required.');
  if(!payoutDetails?.accountName || !payoutDetails.accountNumber || !payoutDetails.institution) throw new Error('Payout account details are required.');
  const settings=await getRewardSettings();
  const normalizedAmount=round2(amount);
  if(normalizedAmount<settings.minWithdrawal) throw new Error(`Minimum withdrawal is ${settings.minWithdrawal} ${settings.currency}.`);
  const wallet=await TipsterWallet.findOne({tipsterId:profile._id}); if(!wallet) throw new Error('Tipster wallet not found.');
  if(String(wallet.currency).toUpperCase()!==String(settings.currency).toUpperCase()) throw new Error(`Wallet currency ${wallet.currency} does not match reward currency ${settings.currency}.`);
  const session=await mongoose.startSession();
  try {
    let withdrawal:any;
    await session.withTransaction(async()=>{
      const pending=await WithdrawalRequest.findOne({tipsterId:profile._id,status:{$in:['pending','approved']}}).session(session);
      if(pending) throw new Error('You already have a withdrawal request being processed.');
      const debited=await TipsterWallet.findOneAndUpdate({_id:wallet._id,availableBalance:{$gte:normalizedAmount},currency:wallet.currency},{$inc:{availableBalance:-normalizedAmount}},{new:true,session});
      if(!debited) throw new Error('Insufficient available balance.');
      withdrawal=(await WithdrawalRequest.create([{tipsterId:profile._id,walletId:wallet._id,amount:normalizedAmount,currency:wallet.currency,method,payoutAccountName:payoutDetails.accountName,payoutAccountNumber:payoutDetails.accountNumber,payoutInstitution:payoutDetails.institution,note,status:'pending'}],{session}))[0];
      await WalletTransaction.create([{tipsterId:profile._id,walletId:wallet._id,type:'WITHDRAWAL',amount:-normalizedAmount,currency:wallet.currency,status:'pending',reference:`withdrawal:${withdrawal._id}`,withdrawalId:withdrawal._id,description:`Withdrawal request via ${method.replace('_',' ')}`}],{session});
    });
    return withdrawal;
  } finally { await session.endSession(); }
}

export async function settleWithdrawal(id:string,status:'approved'|'paid'|'rejected',adminNote?:string){
  const session=await mongoose.startSession();
  let emailPayload:any;
  try {
    let withdrawal:any;
    await session.withTransaction(async()=>{
      withdrawal=await WithdrawalRequest.findById(id).session(session); if(!withdrawal) throw new Error('Withdrawal request not found');
      if(adminNote!==undefined) withdrawal.adminNote=adminNote;
      if(status==='approved'){
        if(withdrawal.status!=='pending') { if(withdrawal.status==='approved'){ emailPayload={status:withdrawal.status,amount:withdrawal.amount,tipsterId:withdrawal.tipsterId}; return; } throw new Error('Only pending withdrawals can be approved.'); }
        withdrawal.status='approved'; withdrawal.approvedAt=new Date(); await withdrawal.save({session});
      }
      if(status==='rejected'){
        if(['rejected','cancelled'].includes(withdrawal.status)){ emailPayload={status:withdrawal.status,amount:withdrawal.amount,tipsterId:withdrawal.tipsterId}; return; }
        if(['pending','approved'].includes(withdrawal.status)){
          await TipsterWallet.updateOne({_id:withdrawal.walletId},{$inc:{availableBalance:withdrawal.amount}},{session});
          await WalletTransaction.updateOne({reference:`withdrawal:${withdrawal._id}`,status:'pending'},{$set:{status:'cancelled'}},{session});
        }
        withdrawal.status='rejected'; withdrawal.rejectedAt=new Date(); await withdrawal.save({session});
      }
      if(status==='paid'){
        if(withdrawal.status==='paid'){ emailPayload={status:withdrawal.status,amount:withdrawal.amount,tipsterId:withdrawal.tipsterId}; return; }
        if(!['approved','pending'].includes(withdrawal.status)) throw new Error('Withdrawal cannot be marked paid from its current status.');
        withdrawal.status='paid'; withdrawal.paidAt=new Date(); await withdrawal.save({session});
        await TipsterWallet.updateOne({_id:withdrawal.walletId},{$inc:{lifetimeWithdrawn:withdrawal.amount}},{session});
        await TipsterProfile.updateOne({_id:withdrawal.tipsterId},{$inc:{totalRewardsPaid:withdrawal.amount}},{session});
        await WalletTransaction.updateOne({reference:`withdrawal:${withdrawal._id}`,status:'pending'},{$set:{status:'completed'}},{session});
      }
      emailPayload={status:withdrawal.status,amount:withdrawal.amount,tipsterId:withdrawal.tipsterId};
    });
    const profile=await TipsterProfile.findById(emailPayload.tipsterId).populate('userId','email name');
    const u:any=profile?.userId;
    if(u?.email) await sendWithdrawalEmail(u.email,u.name||'Tipster',emailPayload.status,emailPayload.amount).catch(()=>{});
    return withdrawal;
  } finally { await session.endSession(); }
}

export async function getTipsterWallet(userId:string){
  const profile=await TipsterProfile.findOne({userId}); if(!profile) throw new Error('Tipster profile not found');
  const settings=await getRewardSettings();
  const wallet=await TipsterWallet.findOneAndUpdate({tipsterId:profile._id},{$set:{currency:settings.currency},$setOnInsert:{tipsterId:profile._id}},{upsert:true,new:true,setDefaultsOnInsert:true});
  const [transactions,withdrawals]=await Promise.all([
    WalletTransaction.find({tipsterId:profile._id}).sort({createdAt:-1}).limit(50),
    WithdrawalRequest.find({tipsterId:profile._id}).sort({createdAt:-1}).limit(30)
  ]);
  return {wallet,transactions,withdrawals,settings};
}

export async function getTipsterWalletIntegrity(userId:string){
  const profile=await TipsterProfile.findOne({userId}); if(!profile) throw new Error('Tipster profile not found');
  const wallet=await TipsterWallet.findOne({tipsterId:profile._id}); if(!wallet) throw new Error('Tipster wallet not found');
  const [pending,available,withdrawals]=await Promise.all([
    WalletTransaction.aggregate([{$match:{tipsterId:profile._id,type:{$in:['PERFORMANCE_REWARD','BONUS','ADJUSTMENT']},status:'pending'}},{$group:{_id:null,amount:{$sum:'$amount'}}}]),
    WalletTransaction.aggregate([{$match:{tipsterId:profile._id,type:{$in:['PERFORMANCE_REWARD','BONUS','ADJUSTMENT']},status:{$in:['available','completed']}}},{$group:{_id:null,amount:{$sum:'$amount'}}}]),
    WalletTransaction.aggregate([{$match:{tipsterId:profile._id,type:'WITHDRAWAL',status:{$in:['pending','completed']}}},{$group:{_id:null,amount:{$sum:'$amount'}}}])
  ]);
  const expectedPending=round2(Number(pending[0]?.amount||0));
  const expectedAvailable=round2(Number(available[0]?.amount||0)+Number(withdrawals[0]?.amount||0));
  const pendingOk=Math.abs(wallet.pendingBalance-expectedPending)<0.01;
  const availableOk=Math.abs(wallet.availableBalance-expectedAvailable)<0.01;
  const nonNegative=wallet.availableBalance>=0 && wallet.pendingBalance>=0;
  const currencyConsistent=String(wallet.currency).toUpperCase()===String((await getRewardSettings()).currency).toUpperCase();
  return {ok:pendingOk&&availableOk&&nonNegative&&currencyConsistent,currency:wallet.currency,balances:{available:round2(wallet.availableBalance),pending:round2(wallet.pendingBalance),lifetimeEarned:round2(wallet.lifetimeEarned),lifetimeWithdrawn:round2(wallet.lifetimeWithdrawn)},ledger:{expectedAvailable,expectedPending,withdrawalLedger:round2(Number(withdrawals[0]?.amount||0)),availableCredits:round2(Number(available[0]?.amount||0))},checks:{pendingBalance:pendingOk,availableBalance:availableOk,nonNegative,currencyConsistent}};
}

export async function settlePredictionRewards(predictionId:string){
  // Keep existing result settlement behavior; wallet rewards are now generated from monthly pool allocation.
  const prediction=await Prediction.findById(predictionId);
  if(!prediction || !['won','lost','void'].includes(prediction.status)) return null;
  await UserPick.updateMany({predictionId:prediction._id,status:'open'},{$set:{status:prediction.status==='won'?'won':prediction.status==='lost'?'lost':'void'}});
  return {settled:true};
}

export async function settleAllRewards(){ return {ok:true}; }
