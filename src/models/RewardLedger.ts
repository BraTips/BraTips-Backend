import { Schema, model, type Document, Types } from 'mongoose';
export type RewardStatus='pending'|'approved'|'paid'|'cancelled';
export interface IRewardLedger extends Document { tipsterId:Types.ObjectId; predictionId:Types.ObjectId; ruleId:Types.ObjectId; streak:number; amount:number; currency:string; status:RewardStatus; paidAt?:Date; approvedAt?:Date; note?:string; createdAt:Date; updatedAt:Date; }
const schema=new Schema<IRewardLedger>({tipsterId:{type:Schema.Types.ObjectId,ref:'TipsterProfile',required:true,index:true},predictionId:{type:Schema.Types.ObjectId,ref:'Prediction',required:true,index:true},ruleId:{type:Schema.Types.ObjectId,ref:'RewardRule',required:true},streak:{type:Number,required:true,min:1},amount:{type:Number,required:true,min:0},currency:{type:String,default:'GHS'},status:{type:String,enum:['pending','approved','paid','cancelled'],default:'pending',index:true},paidAt:Date,approvedAt:Date,note:String},{timestamps:true});
schema.index({predictionId:1,ruleId:1},{unique:true});
export const RewardLedger=model<IRewardLedger>('RewardLedger',schema);
