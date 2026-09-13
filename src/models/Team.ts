import { Schema, model, type Document } from "mongoose";
export interface ITeam extends Document {
  externalId?: string; name: string; shortName?: string; country?: string; logo?: string; active: boolean;
}
const schema = new Schema<ITeam>({
  externalId: { type: String, index: true, sparse: true },
  name: { type: String, required: true, trim: true },
  shortName: String, country: String, logo: String,
  active: { type: Boolean, default: true, index: true }
}, { timestamps: true });
schema.index({ name: 1, country: 1 });
export const Team = model<ITeam>("Team", schema);