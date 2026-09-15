import { Schema, model, type Document, Types } from 'mongoose';

export type TipsterRewardStatus = 'pending' | 'approved' | 'paid' | 'cancelled';

export interface ITipsterReward extends Document {
  periodId: Types.ObjectId;
  tipsterId: Types.ObjectId;
  settledPredictions: number;
  monthlySettledPredictions: number;
  wins: number;
  losses: number;
  voids: number;
  winRate: number;
  roi: number;
  longestStreak: number;
  volumeScore: number;
  consistencyScore: number;
  roiScore: number;
  qualityScore: number;
  winRateScore: number;
  performanceScore: number;
  sharePercent: number;
  amount: number;
  currency: string;
  status: TipsterRewardStatus;
  approvedAt?: Date;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITipsterReward>({
  periodId: { type: Schema.Types.ObjectId, ref: 'RewardPeriod', required: true, index: true },
  tipsterId: { type: Schema.Types.ObjectId, ref: 'TipsterProfile', required: true, index: true },
  settledPredictions: { type: Number, default: 0 },
  monthlySettledPredictions: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  voids: { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  roi: { type: Number, default: 0 },
  longestStreak: { type: Number, default: 0 },
  volumeScore: { type: Number, default: 0 },
  consistencyScore: { type: Number, default: 0 },
  roiScore: { type: Number, default: 0 },
  qualityScore: { type: Number, default: 0 },
  winRateScore: { type: Number, default: 0 },
  performanceScore: { type: Number, default: 0 },
  sharePercent: { type: Number, default: 0 },
  amount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'USD', uppercase: true },
  status: { type: String, enum: ['pending', 'approved', 'paid', 'cancelled'], default: 'pending', index: true },
  approvedAt: Date,
  paidAt: Date
}, { timestamps: true });

schema.index({ periodId: 1, tipsterId: 1 }, { unique: true });
export const TipsterReward = model<ITipsterReward>('TipsterReward', schema);
