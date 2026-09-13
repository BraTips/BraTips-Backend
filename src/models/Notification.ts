import { Schema, model, type Document, Types } from 'mongoose';
export type NotificationType='prediction'|'result'|'tipster'|'system'|'sync'|'reward'|'follow';
export interface INotification extends Document { userId:Types.ObjectId; type:NotificationType; title:string; message:string; link?:string; read:boolean; createdAt:Date; updatedAt:Date; }
const schema=new Schema<INotification>({userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},type:{type:String,enum:['prediction','result','tipster','system','sync','reward','follow'],required:true,index:true},title:{type:String,required:true,maxlength:160},message:{type:String,required:true,maxlength:1000},link:String,read:{type:Boolean,default:false,index:true}},{timestamps:true});
schema.index({userId:1,createdAt:-1}); schema.index({userId:1,read:1});
export const Notification=model<INotification>('Notification',schema);
