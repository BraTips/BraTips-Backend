import { Schema, model, type Document, Types } from 'mongoose';

export type SubscriptionRevenueStatus = 'paid' | 'refunded' | 'chargeback';

export interface ISubscriptionRevenue extends Document {
  invoiceId: string;
  subscriptionId?: Types.ObjectId;
  userId?: Types.ObjectId;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  amount: number;
  refundedAmount: number;
  currency: string;
  status: SubscriptionRevenueStatus;
  paidAt: Date;
  periodStart?: Date;
  periodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ISubscriptionRevenue>({
  invoiceId: { type: String, required: true, unique: true, index: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'Subscription', index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  amount: { type: Number, required: true, min: 0 },
  refundedAmount: { type: Number, default: 0, min: 0 },
  currency: { type: String, required: true, uppercase: true, trim: true },
  status: { type: String, enum: ['paid', 'refunded', 'chargeback'], default: 'paid', index: true },
  paidAt: { type: Date, required: true, index: true },
  periodStart: Date,
  periodEnd: Date
}, { timestamps: true });

schema.index({ status: 1, paidAt: 1, currency: 1 });
export const SubscriptionRevenue = model<ISubscriptionRevenue>('SubscriptionRevenue', schema);
