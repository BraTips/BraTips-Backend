import { Schema, model, type Document } from 'mongoose';
export interface IRewardRule extends Document { name:string; streak:number; amount:number; currency:string; active:boolean; createdAt:Date; updatedAt:Date; }
const schema=new Schema<IRewardRule>({name:{type:String,required:true,trim:true},streak:{type:Number,required:true,min:1,index:true},amount:{type:Number,required:true,min:0},currency:{type:String,default:'GHS'},active:{type:Boolean,default:true,index:true}},{timestamps:true});
schema.index({streak:1,active:1});
export const RewardRule=model<IRewardRule>('RewardRule',schema);
