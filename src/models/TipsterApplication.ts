import { Schema, model, type Document, Types } from "mongoose";

export type TipsterApplicationStatus = "pending" | "under_review" | "approved" | "rejected" | "more_info" | "suspended";

export interface ITipsterApplication extends Document {
  userId: Types.ObjectId;
  username: string;
  country?: string;
  bio: string;
  experience?: string;
  expertise: string[];
  profilePhoto?: string;
  socialLinks: string[];
  samplePrediction: {
    fixture: string;
    league?: string;
    prediction: string;
    odds: number;
    confidence?: number;
    analysis: string;
    matchId?: Types.ObjectId;
    submittedAt: Date;
  };
  status: TipsterApplicationStatus;
  adminNotes?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITipsterApplication>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  username: { type: String, required: true, trim: true, minlength: 3, maxlength: 40, index: true },
  country: { type: String, trim: true, maxlength: 100 },
  bio: { type: String, required: true, trim: true, maxlength: 1000 },
  experience: { type: String, trim: true, maxlength: 500 },
  expertise: { type: [String], default: [] },
  profilePhoto: { type: String, trim: true },
  socialLinks: { type: [String], default: [] },
  samplePrediction: {
    fixture: { type: String, required: true, trim: true, maxlength: 200 },
    league: { type: String, trim: true, maxlength: 120 },
    prediction: { type: String, required: true, trim: true, maxlength: 200 },
    odds: { type: Number, required: true, min: 1 },
    confidence: { type: Number, min: 0, max: 100 },
    analysis: { type: String, required: true, trim: true, maxlength: 3000 },
    matchId: { type: Schema.Types.ObjectId, ref: "Match" },
    submittedAt: { type: Date, default: Date.now }
  },
  status: { type: String, enum: ["pending", "under_review", "approved", "rejected", "more_info", "suspended"], default: "pending", index: true },
  adminNotes: { type: String, maxlength: 3000 },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
  reviewedAt: Date
}, { timestamps: true });

export const TipsterApplication = model<ITipsterApplication>("TipsterApplication", schema);
