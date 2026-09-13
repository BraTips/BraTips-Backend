import { Schema, model, type Document, Types } from "mongoose";
export type PredictionStatus = "pending" | "published" | "won" | "lost" | "void";
export interface IPrediction extends Document {
  tipsterId: Types.ObjectId; matchId?: Types.ObjectId; fixture: string; league?: string; prediction: string;
  odds: number; isPremium?: boolean; confidence?: number; analysis?: string; status: PredictionStatus; profit?: number;
  publishedAt?: Date; resultAt?: Date; currentStreak?: number; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IPrediction>({
  tipsterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true }, matchId: { type: Schema.Types.ObjectId, ref: "Match" },
  fixture: { type: String, required: true, trim: true }, league: String, prediction: { type: String, required: true }, odds: { type: Number, required: true, min: 1 }, isPremium: { type: Boolean, default: false, index: true },
  confidence: { type: Number, min: 0, max: 100 }, analysis: String,
  status: { type: String, enum: ["pending", "published", "won", "lost", "void"], default: "pending", index: true }, profit: Number, publishedAt: Date, resultAt: Date, currentStreak: { type: Number, default: 0, min: 0 }
}, { timestamps: true });
export const Prediction = model<IPrediction>("Prediction", schema);
