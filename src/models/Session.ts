import { Schema, model, type Document, Types } from "mongoose";

export interface ISession extends Document {
  userId: Types.ObjectId; tokenHash: string; expiresAt: Date;
  userAgent?: string; ip?: string; revokedAt?: Date;
}
const schema = new Schema<ISession>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  expiresAt: { type: Date, required: true },
  userAgent: String, ip: String, revokedAt: Date
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = model<ISession>("Session", schema);