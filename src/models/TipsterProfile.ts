import { Schema, model, type Document, Types } from "mongoose";

export interface ITipsterProfile extends Document {
  userId: Types.ObjectId;
  applicationId: Types.ObjectId;
  username: string;
  bio: string;
  country?: string;
  expertise: string[];
  profilePhoto?: string;
  socialLinks: string[];
  totalTips: number;
  wins: number;
  losses: number;
  profit: number;
  roi: number;
  currentStreak: number;
  longestStreak: number;
  totalRewardsEarned: number;
  totalRewardsPaid: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ITipsterProfile>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  applicationId: { type: Schema.Types.ObjectId, ref: "TipsterApplication", required: true },
  username: { type: String, required: true, unique: true, index: true },
  bio: { type: String, default: "" }, country: String, expertise: { type: [String], default: [] },
  profilePhoto: String, socialLinks: { type: [String], default: [] },
  totalTips: { type: Number, default: 0 }, wins: { type: Number, default: 0 }, losses: { type: Number, default: 0 },
  profit: { type: Number, default: 0 }, roi: { type: Number, default: 0 }, currentStreak: { type: Number, default: 0 }, longestStreak: { type: Number, default: 0 }, totalRewardsEarned: { type: Number, default: 0 }, totalRewardsPaid: { type: Number, default: 0 }, active: { type: Boolean, default: true, index: true }
}, { timestamps: true });
export const TipsterProfile = model<ITipsterProfile>("TipsterProfile", schema);
