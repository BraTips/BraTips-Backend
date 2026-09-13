"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const schema = new mongoose_1.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    role: { type: String, enum: ["user", "admin", "tipster"], default: "user", index: true },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true }
}, { timestamps: true });
exports.User = (0, mongoose_1.model)("User", schema);
