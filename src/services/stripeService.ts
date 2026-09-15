import crypto from 'node:crypto';
import { env } from '../config/env';
import { Subscription, type SubscriptionPlan, type SubscriptionStatus } from '../models/Subscription';
import { StripeEvent } from '../models/StripeEvent';
import { User } from '../models/User';
import { SubscriptionRevenue } from '../models/SubscriptionRevenue';
import { recordSubscriptionRevenue } from './rewardService';

export const plans = [
  {id:'lite',name:'Lite',description:'Dropping Odds and market intelligence.',monthlyPriceId:env.STRIPE_PRICE_LITE_MONTHLY,yearlyPriceId:env.STRIPE_PRICE_LITE_YEARLY},
  {id:'premium',name:'Premium',description:'Full BraTipsters research, premium picks and advanced match intelligence.',monthlyPriceId:env.STRIPE_PRICE_PREMIUM_MONTHLY,yearlyPriceId:env.STRIPE_PRICE_PREMIUM_YEARLY}
] as const;

function requireStripe(){ if(!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.'); return env.STRIPE_SECRET_KEY; }
function formBody(data:Record<string,string|undefined>){ const p=new URLSearchParams(); for(const [k,v] of Object.entries(data)) if(v!==undefined) p.set(k,v); return p; }
async function stripeRequest(path:string, method:'GET'|'POST', body?:URLSearchParams){
  const key=requireStripe();
  const r=await fetch(`https://api.stripe.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/x-www-form-urlencoded'},body});
  const d:any=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d?.error?.message||`Stripe request failed (${r.status})`);
  return d;
}

export function verifyStripeSignature(rawBody:Buffer, signature:string){
  if(!Buffer.isBuffer(rawBody)) throw new Error('Stripe webhook body must be the raw request body.');
  if(!env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook secret is not configured.');
  const parsed=signature.split(',').reduce((a,v)=>{const i=v.indexOf('='); if(i>0){const k=v.slice(0,i); const val=v.slice(i+1); if(k==='t'||k==='v1') a[k].push(val);} return a;},{t:[] as string[],v1:[] as string[]});
  const timestamp=Number(parsed.t[0]);
  if(!Number.isFinite(timestamp)||!parsed.v1.length||Math.abs(Date.now()/1000-timestamp)>300) throw new Error('Invalid or expired Stripe signature.');
  const expected=crypto.createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const valid=parsed.v1.some(v=>v.length===expected.length && crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(v)));
  if(!valid) throw new Error('Invalid Stripe signature.');
  return JSON.parse(rawBody.toString('utf8'));
}

function planForPrice(priceId:string):SubscriptionPlan|undefined{
  if(priceId && (priceId===env.STRIPE_PRICE_LITE_MONTHLY || priceId===env.STRIPE_PRICE_LITE_YEARLY)) return 'lite';
  if(priceId && (priceId===env.STRIPE_PRICE_PREMIUM_MONTHLY || priceId===env.STRIPE_PRICE_PREMIUM_YEARLY)) return 'premium';
  return undefined;
}
function statusAllowed(v:any):SubscriptionStatus{ return ['incomplete','trialing','active','past_due','canceled','unpaid','paused','incomplete_expired'].includes(v)?v:'incomplete'; }
function unixDate(v:any){ return typeof v==='number'?new Date(v*1000):undefined; }
async function getStripeSubscription(id:string){ return stripeRequest(`subscriptions/${encodeURIComponent(id)}`,'GET'); }
async function getStripeCustomer(id:string){ return stripeRequest(`customers/${encodeURIComponent(id)}`,'GET'); }

async function resolveUserId(obj:any, existing?:any):Promise<string|undefined>{
  if(obj?.metadata?.userId) return String(obj.metadata.userId);
  if(existing?.userId) return String(existing.userId);
  const customerId=String(obj?.customer||'');
  if(!customerId || !env.STRIPE_SECRET_KEY) return undefined;
  try { const customer=await getStripeCustomer(customerId); return customer?.metadata?.userId ? String(customer.metadata.userId) : undefined; } catch { return undefined; }
}

async function upsertSubscriptionFromStripeObject(obj:any, fallback?:{userId?:string;plan?:SubscriptionPlan;priceId?:string}){
  const subscriptionId=String(obj?.id||'');
  const customerId=String(obj?.customer||'');
  if(!subscriptionId || !customerId) return null;
  const priceId=String(obj?.items?.data?.[0]?.price?.id||fallback?.priceId||'');
  const existing=await Subscription.findOne({$or:[{stripeSubscriptionId:subscriptionId},{stripeCustomerId:customerId}]});
  const userId=await resolveUserId(obj,existing) || fallback?.userId;
  if(!userId) return existing;
  const plan=(obj?.metadata?.plan as SubscriptionPlan|undefined)||fallback?.plan||existing?.plan||planForPrice(priceId);
  if(!plan) throw new Error(`Unable to determine BraTipsters plan for Stripe subscription ${subscriptionId}.`);
  return Subscription.findOneAndUpdate(
    {$or:[{userId},{stripeSubscriptionId:subscriptionId},{stripeCustomerId:customerId}]},
    {$set:{userId,plan,status:statusAllowed(obj.status),stripeCustomerId:customerId,stripeSubscriptionId:subscriptionId,stripePriceId:priceId||existing?.stripePriceId||'unknown',currentPeriodStart:unixDate(obj.current_period_start),currentPeriodEnd:unixDate(obj.current_period_end),cancelAtPeriodEnd:Boolean(obj.cancel_at_period_end),canceledAt:unixDate(obj.canceled_at)}},
    {upsert:true,new:true,setDefaultsOnInsert:true}
  );
}

export async function createCheckout(userId:string, plan:SubscriptionPlan, interval:'month'|'year', successUrl:string, cancelUrl:string){
  const user=await User.findById(userId); if(!user) throw new Error('User not found');
  const config=plans.find(x=>x.id===plan); const priceId=interval==='year'?config?.yearlyPriceId:config?.monthlyPriceId;
  if(!priceId) throw new Error(`Stripe price is not configured for ${plan} ${interval}.`);
  const existing=await Subscription.findOne({userId,status:{$in:['active','trialing','past_due','incomplete']}}).sort({createdAt:-1});
  if(existing && ['active','trialing'].includes(existing.status)) throw new Error('You already have an active BraTipsters subscription. Use Manage subscription to change or cancel it.');
  let customerId=existing?.stripeCustomerId;
  if(!customerId){ const customer=await stripeRequest('customers','POST',formBody({'email':user.email,'name':user.name,'metadata[userId]':String(user._id)})); customerId=customer.id; }
  return stripeRequest('checkout/sessions','POST',formBody({
    mode:'subscription',customer:customerId,'line_items[0][price]':priceId,'line_items[0][quantity]':'1',success_url:successUrl,cancel_url:cancelUrl,'allow_promotion_codes':'true',
    'metadata[userId]':String(user._id),'metadata[plan]':plan,'metadata[interval]':interval,
    'subscription_data[metadata][userId]':String(user._id),'subscription_data[metadata][plan]':plan,'subscription_data[metadata][interval]':interval
  }));
}

export async function createPortal(userId:string, returnUrl:string){
  const sub=await Subscription.findOne({userId}).sort({createdAt:-1}); if(!sub?.stripeCustomerId) throw new Error('No Stripe customer is linked to this account.');
  return stripeRequest('billing_portal/sessions','POST',formBody({customer:sub.stripeCustomerId,return_url:returnUrl}));
}

async function claimStripeEvent(event:any){
  const token=crypto.randomUUID();
  const now=new Date();
  const stale=new Date(Date.now()-10*60*1000);
  const current=await StripeEvent.findOne({eventId:event.id});
  if(current?.processedAt) return null;
  if(current?.processingAt && current.processingAt>stale) return 'BUSY';
  if(!current){
    try { const created=await StripeEvent.create({eventId:event.id,type:event.type,receivedAt:now,processingAt:now,processingToken:token}); return created.processingToken===token?token:null; }
    catch(error:any){ if(error?.code!==11000) throw error; return claimStripeEvent(event); }
  }
  const claimed=await StripeEvent.findOneAndUpdate({eventId:event.id,processedAt:{$exists:false},$or:[{processingAt:{$lt:stale}},{processingAt:{$exists:false}}]},{$set:{processingAt:now,processingToken:token,type:event.type}},{new:true});
  return claimed?.processingToken===token?token:null;
}

export async function handleStripeEvent(event:any){
  if(!event?.id||!event?.type) throw new Error('Invalid Stripe event.');
  const token=await claimStripeEvent(event);
  if(!token) return {duplicate:true};
  if(token==='BUSY') return {duplicate:true,busy:true};
  const obj=event.data?.object||{};
  try {
    if(event.type==='checkout.session.completed'){
      const userId=String(obj.metadata?.userId||''); const plan=obj.metadata?.plan as SubscriptionPlan|undefined; const subscriptionId=String(obj.subscription||''); const customerId=String(obj.customer||'');
      if(userId && plan && subscriptionId){
        let stripeSub:any;
        try { stripeSub=await getStripeSubscription(subscriptionId); } catch { stripeSub=undefined; }
        if(stripeSub) await upsertSubscriptionFromStripeObject(stripeSub,{userId,plan,priceId:stripeSub?.items?.data?.[0]?.price?.id});
        else await Subscription.findOneAndUpdate({userId},{$set:{plan,status:'incomplete',stripeCustomerId:customerId,stripeSubscriptionId:subscriptionId,stripePriceId:'pending',cancelAtPeriodEnd:false}},{upsert:true,new:true,setDefaultsOnInsert:true});
      }
    }
    if(event.type.startsWith('customer.subscription.')) await upsertSubscriptionFromStripeObject(obj);
    if(event.type==='invoice.paid' || event.type==='invoice.payment_failed'){
      const customerId=String(obj.customer||''); const subId=String(obj.subscription||'');
      const filters:any[]=[]; if(subId) filters.push({stripeSubscriptionId:subId}); if(customerId) filters.push({stripeCustomerId:customerId});
      let sub=filters.length?await Subscription.findOne({$or:filters}):null;
      if(!sub && subId){ try { sub=await upsertSubscriptionFromStripeObject(await getStripeSubscription(subId)); } catch {} }
      if(sub && event.type==='invoice.payment_failed' && ['active','trialing','incomplete'].includes(sub.status)){ sub.status='past_due'; await sub.save(); }
      if(event.type==='invoice.paid' && Number(obj.amount_paid||0)>0){
        if(sub && ['incomplete','past_due'].includes(sub.status)){ sub.status='active'; await sub.save(); }
        await recordSubscriptionRevenue({invoiceId:String(obj.id),customerId,subscriptionId:subId,amount:Number(obj.amount_paid)/100,currency:String(obj.currency||env.STRIPE_CURRENCY).toUpperCase(),paidAt:unixDate(obj.status_transitions?.paid_at)||new Date(),periodStart:unixDate(obj.lines?.data?.[0]?.period?.start),periodEnd:unixDate(obj.lines?.data?.[0]?.period?.end)});
      }
    }
    if(event.type==='charge.dispute.created'){
      const invoiceId=String(obj.invoice||'');
      if(invoiceId){
        const revenue=await SubscriptionRevenue.findOne({invoiceId});
        if(revenue){ revenue.status='chargeback'; await revenue.save(); }
      }
    }
    if(event.type==='charge.dispute.closed' && obj.status==='won'){
      const invoiceId=String(obj.invoice||'');
      if(invoiceId){ const revenue=await SubscriptionRevenue.findOne({invoiceId}); if(revenue && revenue.amount>0){ revenue.status='paid'; await revenue.save(); } }
    }
    if(event.type==='charge.refunded'){
      const invoiceId=String(obj.invoice||'');
      if(invoiceId){
        const revenue=await SubscriptionRevenue.findOne({invoiceId});
        if(revenue){
          const original=Number(revenue.amount||0)+Number(revenue.refundedAmount||0);
          const cumulative=Math.min(original,Number(obj.amount_refunded||0)/100);
          revenue.refundedAmount=cumulative; revenue.amount=Math.max(0,Math.round((original-cumulative)*100)/100); revenue.status=revenue.amount<=0?'refunded':'paid'; await revenue.save();
        }
      }
    }
    await StripeEvent.updateOne({eventId:event.id,processingToken:token},{$set:{processedAt:new Date()},$unset:{processingAt:1,processingToken:1}});
    return {duplicate:false};
  } catch(error){
    await StripeEvent.updateOne({eventId:event.id,processingToken:token},{$unset:{processingAt:1,processingToken:1}}).catch(()=>{});
    throw error;
  }
}
