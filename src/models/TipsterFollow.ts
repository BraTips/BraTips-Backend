import { Schema, model, type Document, Types } from 'mongoose';
export interface ITipsterFollow extends Document { userId:Types.ObjectId; tipsterId:Types.ObjectId; createdAt:Date; }
const schema=new Schema<ITipsterFollow>({userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},tipsterId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true}},{timestamps:true});
schema.index({userId:1,tipsterId:1},{unique:true});
export const TipsterFollow=model<ITipsterFollow>('TipsterFollow',schema);
