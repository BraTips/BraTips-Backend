import { Schema, model, type Document, Types } from 'mongoose';
export type BetOfDayStatus='draft'|'approved'|'published'|'won'|'lost'|'void';
export interface IBetOfDay extends Document { date:string; matchId:Types.ObjectId; prediction:string; odds?:number; confidence:number; risk:string; analysis:string; model:string; status:BetOfDayStatus; result?:'won'|'lost'|'void'; createdAt:Date; updatedAt:Date; }
const schema=new Schema<IBetOfDay>({date:{type:String,required:true,index:true},matchId:{type:Schema.Types.ObjectId,ref:'Match',required:true},prediction:{type:String,required:true},odds:{type:Number,min:1},confidence:{type:Number,min:0,max:100,required:true},risk:{type:String,default:'low'},analysis:{type:String,default:''},model:{type:String,default:'heuristic'},status:{type:String,enum:['draft','approved','published','won','lost','void'],default:'draft',index:true},result:{type:String,enum:['won','lost','void']}},{timestamps:true});
schema.index({date:1,matchId:1},{unique:true});
export const BetOfDay=model<IBetOfDay>('BetOfDay',schema);
