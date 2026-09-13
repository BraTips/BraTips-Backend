import { Router } from 'express';
import { requireAuth, type AuthRequest } from '../middleware/auth';
import { Subscription } from '../models/Subscription';
import { createCheckout, createPortal, handleStripeEvent, plans, verifyStripeSignature } from '../services/stripeService';
import { env } from '../config/env';

export const billingRouter=Router();
billingRouter.get('/plans',(_req,res)=>res.json({data:plans.map(p=>({id:p.id,name:p.name,description:p.description,monthlyConfigured:Boolean(p.monthlyPriceId),yearlyConfigured:Boolean(p.yearlyPriceId)}))}));
billingRouter.get('/me',requireAuth,async(req:AuthRequest,res,next)=>{try{const subscription=await Subscription.findOne({userId:req.user!.id}).sort({createdAt:-1});res.json({data:{subscription,active:Boolean(subscription&&['active','trialing'].includes(subscription.status))}})}catch(e){next(e)}});
billingRouter.post('/checkout',requireAuth,async(req:AuthRequest,res,next)=>{try{const plan=req.body?.plan==='lite'?'lite':'premium';const interval=req.body?.interval==='year'?'year':'month';const successUrl=String(req.body?.successUrl||`${env.WEB_URL}/subscription?success=1`);const cancelUrl=String(req.body?.cancelUrl||`${env.WEB_URL}/subscription?canceled=1`);const session=await createCheckout(req.user!.id,plan,interval,successUrl,cancelUrl);res.json({data:{url:session.url,id:session.id}})}catch(e){next(e)}});
billingRouter.post('/portal',requireAuth,async(req:AuthRequest,res,next)=>{try{const returnUrl=String(req.body?.returnUrl||`${env.WEB_URL}/subscription`);const session=await createPortal(req.user!.id,returnUrl);res.json({data:{url:session.url}})}catch(e){next(e)}});
export async function stripeWebhook(req:any,res:any){try{const signature=String(req.headers['stripe-signature']||'');const event=verifyStripeSignature(req.body as Buffer,signature);await handleStripeEvent(event);res.json({received:true});}catch(e:any){res.status(400).json({message:e?.message||'Webhook error'});}}
