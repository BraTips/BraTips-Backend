import { Schema, model, type Document, Types } from "mongoose";
export type PredictionStatus = "pending" | "published" | "won" | "lost" | "void";
export interface IPrediction extends Document {
  tipsterId?: Types.ObjectId; matchId?: Types.ObjectId; fixture: string; league?: string; prediction: string;
  odds: number; isPremium?: boolean; confidence?: number; analysis?: string; status: PredictionStatus; profit?: number;
  publishedAt?: Date; resultAt?: Date; currentStreak?: number; seeded?: boolean; systemGenerated?: boolean; source?: string; modelVersion?: string; modelScore?: number; expectedValue?: number; modelAgreement?: number; horizon?: 'daily'|'weekly'; oddsSource?: 'bookmaker'|'model-fair'; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IPrediction>({
  tipsterId: { type: Schema.Types.ObjectId, ref: "User", index: true }, matchId: { type: Schema.Types.ObjectId, ref: "Match" },
  fixture: { type: String, required: true, trim: true }, league: String, prediction: { type: String, required: true }, odds: { type: Number, required: true, min: 1 }, isPremium: { type: Boolean, default: false, index: true },
  confidence: { type: Number, min: 0, max: 100 }, analysis: String,
  status: { type: String, enum: ["pending", "published", "won", "lost", "void"], default: "pending", index: true }, profit: Number, publishedAt: Date, resultAt: Date, currentStreak: { type: Number, default: 0, min: 0 }, seeded: { type: Boolean, default: false, index: true }, systemGenerated: { type: Boolean, default: false, index: true }, source: { type: String, default: "tipster" }, modelVersion: String, modelScore: Number, expectedValue: Number, modelAgreement: Number, horizon: { type: String, enum: ["daily","weekly"] }, oddsSource: { type: String, enum: ["bookmaker","model-fair"], default: 'bookmaker' }
}, { timestamps: true });
schema.index({status:1,publishedAt:-1,createdAt:-1});
schema.index({matchId:1,status:1});
schema.index({tipsterId:1,status:1,publishedAt:-1});
schema.index({systemGenerated:1,horizon:1,publishedAt:-1});
schema.index({matchId:1,systemGenerated:1,horizon:1,prediction:1});
export const Prediction = model<IPrediction>("Prediction", schema);
