import { Schema, model, type Document } from "mongoose";
export interface ILeague extends Document {
  externalId?: string; name: string; country: string; logo?: string; active: boolean;
}
const schema = new Schema<ILeague>({
  externalId: { type: String, index: true, sparse: true },
  name: { type: String, required: true, trim: true },
  country: { type: String, required: true, trim: true },
  logo: String, active: { type: Boolean, default: true, index: true }
}, { timestamps: true });
schema.index({ name: 1, country: 1 }, { unique: true });
export const League = model<ILeague>("League", schema);