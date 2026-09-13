import { Schema, model, type Document, Types } from 'mongoose';
export type UserPickStatus='open'|'won'|'lost'|'void';
export interface IUserPick extends Document { userId:Types.ObjectId; predictionId:Types.ObjectId; stake:number; potentialReturn:number; status:UserPickStatus; createdAt:Date; updatedAt:Date; }
const schema=new Schema<IUserPick>({userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},predictionId:{type:Schema.Types.ObjectId,ref:'Prediction',required:true,index:true},stake:{type:Number,required:true,min:0.01,max:100000},potentialReturn:{type:Number,required:true,min:0},status:{type:String,enum:['open','won','lost','void'],default:'open',index:true}},{timestamps:true});
schema.index({userId:1,createdAt:-1}); export const UserPick=model<IUserPick>('UserPick',schema);
