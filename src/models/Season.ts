import { Schema, model, type Document, Types } from "mongoose";
export interface ISeason extends Document {
  leagueId: Types.ObjectId; externalId?: string; name: string; startDate?: Date; endDate?: Date; active: boolean;
}
const schema = new Schema<ISeason>({
  leagueId: { type: Schema.Types.ObjectId, ref: "League", required: true, index: true },
  externalId: { type: String, index: true, sparse: true },
  name: { type: String, required: true }, startDate: Date, endDate: Date,
  active: { type: Boolean, default: false }
}, { timestamps: true });
schema.index({ leagueId: 1, name: 1 }, { unique: true });
export const Season = model<ISeason>("Season", schema);