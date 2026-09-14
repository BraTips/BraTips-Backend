import crypto from 'node:crypto';
import { env } from '../config/env';
import { Subscription, type SubscriptionPlan } from '../models/Subscription';
import { StripeEvent } from '../models/StripeEvent';
import { User } from '../models/User';

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
  if(!env.STRIPE_WEBHOOK_SECRET) throw new Error('Stripe webhook secret is not configured.');
  const parts=signature.split(',').reduce((a,v)=>{const [k,val]=v.split('=');if(k&&val)a[k]=val;return a as Record<string,string>},{} as Record<string,string>);
  const timestamp=Number(parts.t); const v1=parts.v1;
  if(!timestamp||!v1||Math.abs(Date.now()/1000-timestamp)>300) throw new Error('Invalid or expired Stripe signature.');
  const expected=crypto.createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  if(!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(v1))) throw new Error('Invalid Stripe signature.');
  return JSON.parse(rawBody.toString('utf8'));
}

export async function createCheckout(userId:string, plan:SubscriptionPlan, interval:'month'|'year', successUrl:string, cancelUrl:string){
  const user=await User.findById(userId); if(!user) throw new Error('User not found');
  const config=plans.find(x=>x.id===plan); const priceId=interval==='year'?config?.yearlyPriceId:config?.monthlyPriceId;
  if(!priceId) throw new Error(`Stripe price is not configured for ${plan} ${interval}.`);
  const existing=await Subscription.findOne({userId,status:{$in:['active','trialing','past_due','incomplete']}}).sort({createdAt:-1});
  if(existing && ['active','trialing'].includes(existing.status)) throw new Error('You already have an active BraTipsters subscription. Use Manage subscription to change or cancel it.');
  let customerId=existing?.stripeCustomerId;
  if(!customerId){ const customer=await stripeRequest('customers','POST',formBody({'email':user.email,'name':user.name,'metadata[userId]':String(user._id)})); customerId=customer.id; }
  const session=await stripeRequest('checkout/sessions','POST',formBody({mode:'subscription',customer:customerId,'line_items[0][price]':priceId,'line_items[0][quantity]':'1',success_url:successUrl,cancel_url:cancelUrl,'allow_promotion_codes':'true','metadata[userId]':String(user._id),'metadata[plan]':plan,'metadata[interval]':interval}));
  return session;
}

export async function createPortal(userId:string, returnUrl:string){
  const sub=await Subscription.findOne({userId}).sort({createdAt:-1}); if(!sub?.stripeCustomerId) throw new Error('No Stripe customer is linked to this account.');
  return stripeRequest('billing_portal/sessions','POST',formBody({customer:sub.stripeCustomerId,return_url:returnUrl}));
}

function unixDate(v:any){ return typeof v==='number'?new Date(v*1000):undefined; }
function statusAllowed(v:any):any{ return ['incomplete','trialing','active','past_due','canceled','unpaid','paused','incomplete_expired'].includes(v)?v:'incomplete'; }

export async function handleStripeEvent(event:any){
  if(await StripeEvent.exists({eventId:event.id})) return {duplicate:true};
  await StripeEvent.create({eventId:event.id,type:event.type});
  const obj=event.data?.object||{};
  if(event.type==='checkout.session.completed'){
    const userId=obj.metadata?.userId; const plan=obj.metadata?.plan;
    if(userId && plan && obj.subscription){
      await Subscription.findOneAndUpdate({userId,stripeSubscriptionId:String(obj.subscription)},{$set:{plan,status:'active',stripeCustomerId:String(obj.customer),stripeSubscriptionId:String(obj.subscription),stripePriceId:'checkout',cancelAtPeriodEnd:false}},{upsert:true,new:true,setDefaultsOnInsert:true});
    }
  }
  if(event.type.startsWith('customer.subscription.')){
    const customerId=String(obj.customer||''); const subscriptionId=String(obj.id||'');
    const item=obj.items?.data?.[0]; const priceId=item?.price?.id||'';
    const metadataPlan=obj.metadata?.plan as SubscriptionPlan|undefined;
    const existing=await Subscription.findOne({$or:[{stripeSubscriptionId:subscriptionId},{stripeCustomerId:customerId}]});
    const plan:SubscriptionPlan=metadataPlan||existing?.plan||'premium';
    if(existing){ existing.plan=plan; existing.status=statusAllowed(obj.status); existing.stripeCustomerId=customerId||existing.stripeCustomerId; existing.stripeSubscriptionId=subscriptionId||existing.stripeSubscriptionId; existing.stripePriceId=priceId||existing.stripePriceId; existing.currentPeriodStart=unixDate(obj.current_period_start); existing.currentPeriodEnd=unixDate(obj.current_period_end); existing.cancelAtPeriodEnd=Boolean(obj.cancel_at_period_end); existing.canceledAt=unixDate(obj.canceled_at); await existing.save(); }
  }
  if(event.type==='invoice.paid' || event.type==='invoice.payment_failed'){
    const customerId=String(obj.customer||'');
    const subId=String(obj.subscription||'');
    const sub=await Subscription.findOne({$or:[{stripeSubscriptionId:subId},{stripeCustomerId:customerId}]});
    if(sub && event.type==='invoice.paid' && sub.status==='past_due') { sub.status='active'; await sub.save(); }
  }
  await StripeEvent.updateOne({eventId:event.id},{$set:{processedAt:new Date()}});
  return {duplicate:false};
}
