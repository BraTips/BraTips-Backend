"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Season = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    leagueId: { type: mongoose_1.Schema.Types.ObjectId, ref: "League", required: true, index: true },
    externalId: { type: String, index: true, sparse: true },
    name: { type: String, required: true }, startDate: Date, endDate: Date,
    active: { type: Boolean, default: false }
}, { timestamps: true });
schema.index({ leagueId: 1, name: 1 }, { unique: true });
exports.Season = (0, mongoose_1.model)("Season", schema);
