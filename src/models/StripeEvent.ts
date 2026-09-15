import { Schema, model, type Document } from 'mongoose';
export interface IStripeEvent extends Document { eventId:string; type:string; receivedAt:Date; processingAt?:Date; processingToken?:string; processedAt?:Date; }
const schema=new Schema<IStripeEvent>({eventId:{type:String,unique:true,required:true,index:true},type:{type:String,required:true},receivedAt:{type:Date,default:Date.now},processingAt:Date,processingToken:String,processedAt:Date});
schema.index({processingAt:1,processedAt:1});
export const StripeEvent=model<IStripeEvent>('StripeEvent',schema);
