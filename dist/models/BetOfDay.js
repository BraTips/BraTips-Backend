"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetOfDay = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({ date: { type: String, required: true, index: true }, matchId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Match', required: true }, prediction: { type: String, required: true }, confidence: { type: Number, min: 0, max: 100, required: true }, risk: { type: String, default: 'low' }, analysis: { type: String, default: '' }, model: { type: String, default: 'heuristic' }, status: { type: String, enum: ['draft', 'approved', 'published', 'won', 'lost', 'void'], default: 'draft', index: true }, result: { type: String, enum: ['won', 'lost', 'void'] } }, { timestamps: true });
schema.index({ date: 1, matchId: 1 }, { unique: true });
exports.BetOfDay = (0, mongoose_1.model)('BetOfDay', schema);
