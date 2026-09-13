"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Team = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    externalId: { type: String, index: true, sparse: true },
    name: { type: String, required: true, trim: true },
    shortName: String, country: String, logo: String,
    active: { type: Boolean, default: true, index: true }
}, { timestamps: true });
schema.index({ name: 1, country: 1 });
exports.Team = (0, mongoose_1.model)("Team", schema);
