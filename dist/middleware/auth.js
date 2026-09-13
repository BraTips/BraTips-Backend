"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireRole = requireRole;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const User_1 = require("../models/User");
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer "))
        return res.status(401).json({ message: "Authentication required" });
    try {
        const payload = jsonwebtoken_1.default.verify(header.slice(7), env_1.env.JWT_ACCESS_SECRET);
        if (payload.type !== "access")
            return res.status(401).json({ message: "Invalid access token" });
        req.user = { id: payload.sub, role: payload.role };
        next();
    }
    catch {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}
function requireRole(...roles) {
    return async (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role))
            return res.status(403).json({ message: "Forbidden" });
        const user = await User_1.User.findById(req.user.id).select("_id status role");
        if (!user || user.status !== "active" || user.role !== req.user.role)
            return res.status(403).json({ message: "User is not active" });
        next();
    };
}
