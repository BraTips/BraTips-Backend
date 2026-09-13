"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const User_1 = require("../models/User");
const Session_1 = require("../models/Session");
const env_1 = require("../config/env");
const tokens_1 = require("../utils/tokens");
const auth_1 = require("../middleware/auth");
const TipsterApplication_1 = require("../models/TipsterApplication");
exports.authRouter = (0, express_1.Router)();
const registerSchema = zod_1.z.object({ name: zod_1.z.string().min(2).max(100), email: zod_1.z.string().email(), password: zod_1.z.string().min(8).max(128) });
const loginSchema = zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string().min(1) });
const tipsterApplicationSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100), email: zod_1.z.string().email(), password: zod_1.z.string().min(8).max(128),
    username: zod_1.z.string().min(3).max(40), country: zod_1.z.string().max(100).optional(), bio: zod_1.z.string().min(20).max(1000),
    experience: zod_1.z.string().max(500).optional(), expertise: zod_1.z.array(zod_1.z.string().min(1).max(80)).default([]),
    profilePhoto: zod_1.z.string().url().optional().or(zod_1.z.literal("")), socialLinks: zod_1.z.array(zod_1.z.string().url()).default([]),
    samplePrediction: zod_1.z.object({ fixture: zod_1.z.string().min(3).max(200), league: zod_1.z.string().max(120).optional(), prediction: zod_1.z.string().min(2).max(200), odds: zod_1.z.coerce.number().min(1), confidence: zod_1.z.coerce.number().min(0).max(100).optional(), analysis: zod_1.z.string().min(20).max(3000) })
});
function cookieOptions() {
    return { httpOnly: true, secure: env_1.env.NODE_ENV === "production", sameSite: "lax", path: "/api/v1/auth" };
}
exports.authRouter.post("/register", async (req, res) => {
    const data = registerSchema.parse(req.body);
    const email = data.email.toLowerCase();
    if (await User_1.User.exists({ email }))
        return res.status(409).json({ message: "Email already registered" });
    const user = await User_1.User.create({ name: data.name, email, passwordHash: await bcryptjs_1.default.hash(data.password, 12) });
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});
exports.authRouter.post("/tipster-apply", async (req, res) => {
    const data = tipsterApplicationSchema.parse(req.body);
    const email = data.email.toLowerCase();
    if (await User_1.User.exists({ email }))
        return res.status(409).json({ message: "Email already registered. Sign in and contact support to submit a tipster application." });
    if (await TipsterApplication_1.TipsterApplication.exists({ username: data.username }))
        return res.status(409).json({ message: "Tipster username already in use" });
    const user = await User_1.User.create({ name: data.name, email, passwordHash: await bcryptjs_1.default.hash(data.password, 12), role: "user", status: "active" });
    const application = await TipsterApplication_1.TipsterApplication.create({ userId: user._id, username: data.username, country: data.country, bio: data.bio, experience: data.experience, expertise: data.expertise, profilePhoto: data.profilePhoto, socialLinks: data.socialLinks, samplePrediction: data.samplePrediction, status: "pending" });
    res.status(201).json({ message: "Tipster application submitted for admin approval", applicationId: application.id, status: application.status });
});
exports.authRouter.post("/login", async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await User_1.User.findOne({ email: data.email.toLowerCase() }).select("+passwordHash");
    if (!user || !(await bcryptjs_1.default.compare(data.password, user.passwordHash)))
        return res.status(401).json({ message: "Invalid email or password" });
    if (user.status !== "active")
        return res.status(403).json({ message: "Account is not active" });
    const placeholder = await Session_1.Session.create({ userId: user._id, tokenHash: "pending-" + Date.now(), expiresAt: new Date(Date.now() + 7 * 86400000), userAgent: req.get("user-agent"), ip: req.ip });
    const refreshToken = (0, tokens_1.signRefreshToken)(user.id, placeholder.id);
    placeholder.tokenHash = (0, tokens_1.hashToken)(refreshToken);
    await placeholder.save();
    res.cookie("refreshToken", refreshToken, { ...cookieOptions(), maxAge: 7 * 86400000 });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken: (0, tokens_1.signAccessToken)(user.id, user.role) });
});
exports.authRouter.post("/refresh", async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (!token)
        return res.status(401).json({ message: "Refresh session required" });
    try {
        const payload = (0, tokens_1.verifyRefreshToken)(token);
        const session = await Session_1.Session.findById(payload.sid);
        if (!session || session.revokedAt || session.expiresAt <= new Date() || session.tokenHash !== (0, tokens_1.hashToken)(token))
            return res.status(401).json({ message: "Session expired or revoked" });
        const user = await User_1.User.findById(payload.sub);
        if (!user || user.status !== "active")
            return res.status(401).json({ message: "Account is not active" });
        session.revokedAt = new Date();
        await session.save();
        const replacement = await Session_1.Session.create({ userId: user._id, tokenHash: "pending-" + Date.now(), expiresAt: new Date(Date.now() + 7 * 86400000), userAgent: req.get("user-agent"), ip: req.ip });
        const newRefresh = (0, tokens_1.signRefreshToken)(user.id, replacement.id);
        replacement.tokenHash = (0, tokens_1.hashToken)(newRefresh);
        await replacement.save();
        res.cookie("refreshToken", newRefresh, { ...cookieOptions(), maxAge: 7 * 86400000 });
        res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken: (0, tokens_1.signAccessToken)(user.id, user.role) });
    }
    catch {
        res.status(401).json({ message: "Invalid refresh session" });
    }
});
exports.authRouter.post("/logout", async (req, res) => {
    const token = req.cookies?.refreshToken;
    if (token) {
        try {
            const p = (0, tokens_1.verifyRefreshToken)(token);
            await Session_1.Session.findByIdAndUpdate(p.sid, { revokedAt: new Date() });
        }
        catch { }
    }
    res.clearCookie("refreshToken", cookieOptions());
    res.json({ ok: true });
});
exports.authRouter.get("/me", auth_1.requireAuth, async (req, res) => {
    const user = await User_1.User.findById(req.user.id).select("-passwordHash");
    if (!user)
        return res.status(404).json({ message: "User not found" });
    res.json({ user });
});
