"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserPick = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({ userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, predictionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Prediction', required: true, index: true }, stake: { type: Number, required: true, min: 0.01, max: 100000 }, potentialReturn: { type: Number, required: true, min: 0 }, status: { type: String, enum: ['open', 'won', 'lost', 'void'], default: 'open', index: true } }, { timestamps: true });
schema.index({ userId: 1, createdAt: -1 });
exports.UserPick = (0, mongoose_1.model)('UserPick', schema);
