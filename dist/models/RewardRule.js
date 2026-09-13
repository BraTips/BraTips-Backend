"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewardRule = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({ name: { type: String, required: true, trim: true }, streak: { type: Number, required: true, min: 1, index: true }, amount: { type: Number, required: true, min: 0 }, currency: { type: String, default: 'GHS' }, active: { type: Boolean, default: true, index: true } }, { timestamps: true });
schema.index({ streak: 1, active: 1 });
exports.RewardRule = (0, mongoose_1.model)('RewardRule', schema);
