import { Schema, model, type Document, Types } from 'mongoose';

export type SubscriptionStatus = 'incomplete'|'trialing'|'active'|'past_due'|'canceled'|'unpaid'|'paused'|'incomplete_expired';
export type SubscriptionPlan = 'lite'|'premium';

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  stripePriceId: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISubscription>({
  userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  plan:{type:String,enum:['lite','premium'],required:true,index:true},
  status:{type:String,enum:['incomplete','trialing','active','past_due','canceled','unpaid','paused','incomplete_expired'],required:true,index:true},
  stripeCustomerId:{type:String,required:true,index:true},
  stripeSubscriptionId:{type:String,index:true,sparse:true},
  stripePriceId:{type:String,required:true},
  currentPeriodStart:Date,
  currentPeriodEnd:Date,
  cancelAtPeriodEnd:{type:Boolean,default:false},
  canceledAt:Date
},{timestamps:true});
schema.index({userId:1,status:1});
schema.index({stripeCustomerId:1,stripeSubscriptionId:1});
export const Subscription=model<ISubscription>('Subscription',schema);
