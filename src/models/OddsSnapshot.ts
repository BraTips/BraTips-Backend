import { Schema, model, type Document, Types } from 'mongoose';

export interface IOddsSnapshot extends Document {
  matchId: Types.ObjectId;
  fixtureExternalId: string;
  bookmakerId?: number;
  bookmakerName?: string;
  marketId?: number;
  marketName?: string;
  label: string;
  value: number;
  previousValue?: number;
  movementPct?: number;
  mode: 'pre-match' | 'inplay';
  bookmakerUpdatedAt?: Date;
  recordedAt: Date;
}

const schema = new Schema<IOddsSnapshot>({
  matchId:{type:Schema.Types.ObjectId,ref:'Match',required:true,index:true},
  fixtureExternalId:{type:String,required:true,index:true},
  bookmakerId:Number,
  bookmakerName:String,
  marketId:Number,
  marketName:String,
  label:{type:String,required:true},
  value:{type:Number,required:true,min:1},
  previousValue:Number,
  movementPct:Number,
  mode:{type:String,enum:['pre-match','inplay'],default:'pre-match',index:true},
  bookmakerUpdatedAt:Date,
  recordedAt:{type:Date,default:Date.now,index:true}
},{timestamps:true});

schema.index({matchId:1,bookmakerId:1,marketId:1,label:1,mode:1,recordedAt:-1});
export const OddsSnapshot=model<IOddsSnapshot>('OddsSnapshot',schema);
