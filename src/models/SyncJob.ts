import { Schema, model, type Document } from 'mongoose';
export type SyncJobType = 'daily' | 'live' | 'weekly' | 'manual';
export interface ISyncJob extends Document { type: SyncJobType; status: 'running'|'success'|'failed'; startedAt: Date; finishedAt?: Date; fetched: number; upserted: number; error?: string; date?: string; }
const schema = new Schema<ISyncJob>({ type:{type:String,enum:['daily','live','weekly','manual'],required:true,index:true}, status:{type:String,enum:['running','success','failed'],required:true,index:true}, startedAt:{type:Date,required:true,index:true}, finishedAt:Date, fetched:{type:Number,default:0}, upserted:{type:Number,default:0}, error:String, date:String },{timestamps:true});
export const SyncJob=model<ISyncJob>('SyncJob',schema);
