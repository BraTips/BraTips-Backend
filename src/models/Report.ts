import { Schema, model, type Document, Types } from 'mongoose';

export type ReportCategory = 'content' | 'support' | 'financial';
export type ReportStatus = 'open' | 'in_progress' | 'resolved' | 'rejected' | 'closed';
export type ReportPriority = 'low' | 'medium' | 'high';
export type ReportTargetType = 'prediction' | 'tipster' | 'user' | 'transaction' | 'withdrawal' | 'other';

export interface IReport extends Document {
  reporterId: Types.ObjectId;
  reporterRole: 'user' | 'tipster' | 'admin';
  category: ReportCategory;
  subject: string;
  description: string;
  targetType?: ReportTargetType;
  targetId?: string;
  status: ReportStatus;
  priority: ReportPriority;
  adminNote?: string;
  resolvedBy?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IReport>({
  reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  reporterRole: { type: String, enum: ['user', 'tipster', 'admin'], required: true },
  category: { type: String, enum: ['content', 'support', 'financial'], required: true, index: true },
  subject: { type: String, required: true, trim: true, maxlength: 150 },
  description: { type: String, required: true, maxlength: 3000 },
  targetType: { type: String, enum: ['prediction', 'tipster', 'user', 'transaction', 'withdrawal', 'other'] },
  targetId: { type: String, maxlength: 60 },
  status: { type: String, enum: ['open', 'in_progress', 'resolved', 'rejected', 'closed'], default: 'open', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
  adminNote: { type: String, maxlength: 2000 },
  resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  resolvedAt: Date
}, { timestamps: true });

schema.index({ reporterId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ category: 1, status: 1 });

export const Report = model<IReport>('Report', schema);
