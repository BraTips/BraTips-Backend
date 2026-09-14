import { Schema, model, type Document, Types } from 'mongoose';

export interface ITipsterWallet extends Document {
  tipsterId: Types.ObjectId;
  availableBalance: number;
  pendingBalance: number;
  lifetimeEarned: number;
  lifetimeWithdrawn: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITipsterWallet>({
  tipsterId: { type: Schema.Types.ObjectId, ref: 'TipsterProfile', required: true, unique: true, index: true },
  availableBalance: { type: Number, default: 0, min: 0 },
  pendingBalance: { type: Number, default: 0, min: 0 },
  lifetimeEarned: { type: Number, default: 0, min: 0 },
  lifetimeWithdrawn: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'GHS', uppercase: true }
}, { timestamps: true });

export const TipsterWallet = model<ITipsterWallet>('TipsterWallet', schema);
