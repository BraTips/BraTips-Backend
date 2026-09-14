import { Schema, model, type Document } from 'mongoose';

export interface IRewardSettings extends Document {
  singletonKey: string;
  platformSharePercent: number;
  tipsterPoolPercent: number;
  minSettledPredictions: number;
  minMonthlySettledPredictions: number;
  minWithdrawal: number;
  currency: string;
  updatedAt: Date;
  createdAt: Date;
}

const schema = new Schema<IRewardSettings>({
  singletonKey: { type: String, default: 'default', unique: true },
  platformSharePercent: { type: Number, default: 70, min: 0, max: 100 },
  tipsterPoolPercent: { type: Number, default: 30, min: 0, max: 100 },
  minSettledPredictions: { type: Number, default: 50, min: 1 },
  minMonthlySettledPredictions: { type: Number, default: 5, min: 1 },
  minWithdrawal: { type: Number, default: 10, min: 1 },
  currency: { type: String, default: 'GHS', uppercase: true }
}, { timestamps: true });

export const RewardSettings = model<IRewardSettings>('RewardSettings', schema);
