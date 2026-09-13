"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Match = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    externalId: { type: String, index: true, sparse: true },
    leagueId: { type: mongoose_1.Schema.Types.ObjectId, ref: "League", required: true, index: true },
    seasonId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Season", index: true },
    homeTeamId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    awayTeamId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Team", required: true, index: true },
    kickoff: { type: Date, required: true, index: true },
    status: { type: String, enum: ["scheduled", "live", "finished", "postponed", "cancelled"], default: "scheduled", index: true },
    homeScore: { type: Number, default: 0, min: 0 }, awayScore: { type: Number, default: 0, min: 0 },
    venue: { name: String, city: String }
}, { timestamps: true });
schema.index({ kickoff: 1, status: 1 });
exports.Match = (0, mongoose_1.model)("Match", schema);
