import { Schema, model, type Document, Types } from 'mongoose';

export type WithdrawalStatus = 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
export type WithdrawalMethod = 'mobile_money' | 'bank_transfer';

export interface IWithdrawalRequest extends Document {
  tipsterId: Types.ObjectId;
  walletId: Types.ObjectId;
  amount: number;
  currency: string;
  method: WithdrawalMethod;
  note?: string;
  status: WithdrawalStatus;
  approvedAt?: Date;
  paidAt?: Date;
  rejectedAt?: Date;
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWithdrawalRequest>({
  tipsterId: { type: Schema.Types.ObjectId, ref: 'TipsterProfile', required: true, index: true },
  walletId: { type: Schema.Types.ObjectId, ref: 'TipsterWallet', required: true },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: 'GHS', uppercase: true },
  method: { type: String, enum: ['mobile_money', 'bank_transfer'], required: true },
  note: { type: String, maxlength: 500 },
  status: { type: String, enum: ['pending', 'approved', 'paid', 'rejected', 'cancelled'], default: 'pending', index: true },
  approvedAt: Date,
  paidAt: Date,
  rejectedAt: Date,
  adminNote: { type: String, maxlength: 500 }
}, { timestamps: true });

schema.index({ tipsterId: 1, createdAt: -1 });
export const WithdrawalRequest = model<IWithdrawalRequest>('WithdrawalRequest', schema);
