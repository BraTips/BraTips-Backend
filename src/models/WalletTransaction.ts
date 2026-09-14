import { Schema, model, type Document, Types } from 'mongoose';

export type WalletTransactionType = 'PERFORMANCE_REWARD' | 'BONUS' | 'WITHDRAWAL' | 'WITHDRAWAL_REVERSAL' | 'ADJUSTMENT';
export type WalletTransactionStatus = 'pending' | 'available' | 'completed' | 'cancelled';

export interface IWalletTransaction extends Document {
  tipsterId: Types.ObjectId;
  walletId: Types.ObjectId;
  type: WalletTransactionType;
  amount: number;
  currency: string;
  status: WalletTransactionStatus;
  reference: string;
  description?: string;
  rewardId?: Types.ObjectId;
  withdrawalId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IWalletTransaction>({
  tipsterId: { type: Schema.Types.ObjectId, ref: 'TipsterProfile', required: true, index: true },
  walletId: { type: Schema.Types.ObjectId, ref: 'TipsterWallet', required: true, index: true },
  type: { type: String, enum: ['PERFORMANCE_REWARD', 'BONUS', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL', 'ADJUSTMENT'], required: true, index: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'GHS', uppercase: true },
  status: { type: String, enum: ['pending', 'available', 'completed', 'cancelled'], default: 'pending', index: true },
  reference: { type: String, required: true, unique: true, index: true },
  description: String,
  rewardId: { type: Schema.Types.ObjectId, ref: 'TipsterReward' },
  withdrawalId: { type: Schema.Types.ObjectId, ref: 'WithdrawalRequest' }
}, { timestamps: true });

export const WalletTransaction = model<IWalletTransaction>('WalletTransaction', schema);
