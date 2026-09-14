import { Schema, model, Types } from 'mongoose';
export type BetOfDayStatus='draft'|'approved'|'published'|'won'|'lost'|'void';
export interface IBetOfDay { date:string; matchId:Types.ObjectId; prediction:string; odds?:number; confidence:number; risk:string; analysis:string; model:string; status:BetOfDayStatus; result?:'won'|'lost'|'void'; createdAt:Date; updatedAt:Date; }
const schema=new Schema<IBetOfDay>({date:{type:String,required:true,index:true},matchId:{type:Schema.Types.ObjectId,ref:'Match',required:true},prediction:{type:String,required:true},odds:{type:Number,min:1},confidence:{type:Number,min:0,max:100,required:true},risk:{type:String,default:'low'},analysis:{type:String,default:''},model:{type:String,default:'heuristic'},status:{type:String,enum:['draft','approved','published','won','lost','void'],default:'draft',index:true},result:{type:String,enum:['won','lost','void']}},{timestamps:true});
schema.index({date:1,matchId:1},{unique:true});
schema.index({status:1,date:-1,createdAt:-1});
schema.index({matchId:1,status:1});
export const BetOfDay=model<IBetOfDay>('BetOfDay',schema);
