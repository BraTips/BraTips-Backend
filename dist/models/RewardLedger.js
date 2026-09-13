"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewardLedger = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({ tipsterId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'TipsterProfile', required: true, index: true }, predictionId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Prediction', required: true, index: true }, ruleId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'RewardRule', required: true }, streak: { type: Number, required: true, min: 1 }, amount: { type: Number, required: true, min: 0 }, currency: { type: String, default: 'GHS' }, status: { type: String, enum: ['pending', 'approved', 'paid', 'cancelled'], default: 'pending', index: true }, paidAt: Date, approvedAt: Date, note: String }, { timestamps: true });
schema.index({ predictionId: 1, ruleId: 1 }, { unique: true });
exports.RewardLedger = (0, mongoose_1.model)('RewardLedger', schema);
