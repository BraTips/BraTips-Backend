import { Schema, model, type Document } from 'mongoose';

export type RewardPeriodStatus = 'open' | 'calculated' | 'approved' | 'paid';

export interface IRewardPeriod extends Document {
  key: string;
  label: string;
  startDate: Date;
  endDate: Date;
  currency: string;
  grossRevenue: number;
  platformSharePercent: number;
  tipsterPoolPercent: number;
  tipsterPoolAmount: number;
  platformRevenueAmount: number;
  allocatedAmount: number;
  status: RewardPeriodStatus;
  calculatedAt?: Date;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IRewardPeriod>({
  key: { type: String, required: true, unique: true, index: true },
  label: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  currency: { type: String, default: 'USD', uppercase: true },
  grossRevenue: { type: Number, default: 0, min: 0 },
  platformSharePercent: { type: Number, default: 70, min: 0, max: 100 },
  tipsterPoolPercent: { type: Number, default: 30, min: 0, max: 100 },
  tipsterPoolAmount: { type: Number, default: 0, min: 0 },
  platformRevenueAmount: { type: Number, default: 0, min: 0 },
  allocatedAmount: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['open', 'calculated', 'approved', 'paid'], default: 'open', index: true },
  calculatedAt: Date,
  approvedAt: Date
}, { timestamps: true });

export const RewardPeriod = model<IRewardPeriod>('RewardPeriod', schema);
