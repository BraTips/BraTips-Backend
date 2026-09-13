"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.League = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    externalId: { type: String, index: true, sparse: true },
    name: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    logo: String, active: { type: Boolean, default: true, index: true }
}, { timestamps: true });
schema.index({ name: 1, country: 1 }, { unique: true });
exports.League = (0, mongoose_1.model)("League", schema);
