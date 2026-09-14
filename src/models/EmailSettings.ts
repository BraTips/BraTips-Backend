import { Schema, model, type Document } from "mongoose";

export interface IEmailSettings extends Document {
  host: string; port: number; secure: boolean; username: string; passwordEncrypted: string;
  fromEmail: string; fromName: string; enabled: boolean; updatedAt: Date;
}
const schema = new Schema<IEmailSettings>({
  host:{type:String,default:""}, port:{type:Number,default:587}, secure:{type:Boolean,default:false},
  username:{type:String,default:""}, passwordEncrypted:{type:String,default:""},
  fromEmail:{type:String,default:""}, fromName:{type:String,default:"BraTipsters"}, enabled:{type:Boolean,default:false}
},{timestamps:true});
export const EmailSettings=model<IEmailSettings>("EmailSettings",schema);
