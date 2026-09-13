import { Schema, model, type Document } from 'mongoose';
export interface IStripeEvent extends Document { eventId:string; type:string; receivedAt:Date; processedAt?:Date; }
const schema=new Schema<IStripeEvent>({eventId:{type:String,unique:true,required:true,index:true},type:{type:String,required:true},receivedAt:{type:Date,default:Date.now},processedAt:Date});
export const StripeEvent=model<IStripeEvent>('StripeEvent',schema);
