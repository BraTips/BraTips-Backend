"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Prediction = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    tipsterId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true }, matchId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Match" },
    fixture: { type: String, required: true, trim: true }, league: String, prediction: { type: String, required: true }, odds: { type: Number, required: true, min: 1 },
    confidence: { type: Number, min: 0, max: 100 }, analysis: String,
    status: { type: String, enum: ["pending", "published", "won", "lost", "void"], default: "pending", index: true }, profit: Number, publishedAt: Date, resultAt: Date, currentStreak: { type: Number, default: 0, min: 0 }
}, { timestamps: true });
exports.Prediction = (0, mongoose_1.model)("Prediction", schema);
