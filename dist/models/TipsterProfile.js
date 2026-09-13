"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TipsterProfile = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    applicationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "TipsterApplication", required: true },
    username: { type: String, required: true, unique: true, index: true },
    bio: { type: String, default: "" }, country: String, expertise: { type: [String], default: [] },
    profilePhoto: String, socialLinks: { type: [String], default: [] },
    totalTips: { type: Number, default: 0 }, wins: { type: Number, default: 0 }, losses: { type: Number, default: 0 },
    profit: { type: Number, default: 0 }, roi: { type: Number, default: 0 }, currentStreak: { type: Number, default: 0 }, longestStreak: { type: Number, default: 0 }, totalRewardsEarned: { type: Number, default: 0 }, totalRewardsPaid: { type: Number, default: 0 }, active: { type: Boolean, default: true, index: true }
}, { timestamps: true });
exports.TipsterProfile = (0, mongoose_1.model)("TipsterProfile", schema);
