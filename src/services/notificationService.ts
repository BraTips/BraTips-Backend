import { Notification, type INotification } from '../models/Notification';
import { Types } from 'mongoose';
export async function notify(userId:Types.ObjectId|string, input:Pick<INotification,'type'|'title'|'message'|'link'>){ return Notification.create({userId,type:input.type,title:input.title,message:input.message,link:input.link}); }
export async function notifyMany(userIds:(Types.ObjectId|string)[], input:Pick<INotification,'type'|'title'|'message'|'link'>){ if(!userIds.length)return; await Notification.insertMany(userIds.map(userId=>({...input,userId}))); }
