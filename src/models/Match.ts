import { Schema, model, type Document, Types } from "mongoose";
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";
export interface IMatch extends Document {
  externalId?: string; leagueId: Types.ObjectId; seasonId?: Types.ObjectId;
  homeTeamId: Types.ObjectId; awayTeamId: Types.ObjectId; kickoff: Date;
  status: MatchStatus; homeScore: number; awayScore: number;
  venue?: { name?: string; city?: string };
}
const schema = new Schema<IMatch>({
  externalId: { type: String, index: true, sparse: true },
  leagueId: { type: Schema.Types.ObjectId, ref: "League", required: true, index: true },
  seasonId: { type: Schema.Types.ObjectId, ref: "Season", index: true },
  homeTeamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
  awayTeamId: { type: Schema.Types.ObjectId, ref: "Team", required: true, index: true },
  kickoff: { type: Date, required: true, index: true },
  status: { type: String, enum: ["scheduled","live","finished","postponed","cancelled"], default: "scheduled", index: true },
  homeScore: { type: Number, default: 0, min: 0 }, awayScore: { type: Number, default: 0, min: 0 },
  venue: { name: String, city: String }
}, { timestamps: true });
schema.index({ kickoff: 1, status: 1 });
export const Match = model<IMatch>("Match", schema);