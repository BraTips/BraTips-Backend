"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncJob = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({ type: { type: String, enum: ['daily', 'live', 'manual'], required: true, index: true }, status: { type: String, enum: ['running', 'success', 'failed'], required: true, index: true }, startedAt: { type: Date, required: true, index: true }, finishedAt: Date, fetched: { type: Number, default: 0 }, upserted: { type: Number, default: 0 }, error: String, date: String }, { timestamps: true });
exports.SyncJob = (0, mongoose_1.model)('SyncJob', schema);
