import { sendWelcomeEmail, sendTipsterApplicationSubmittedEmail } from "../services/emailService";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/User";
import { Session } from "../models/Session";
import { env } from "../config/env";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/tokens";
import { requireAuth, type AuthRequest } from "../middleware/auth";
import { TipsterApplication } from "../models/TipsterApplication"; import { Notification } from '../models/Notification';

export const authRouter = Router();
const registerSchema = z.object({ name: z.string().min(2).max(100), email: z.string().email(), password: z.string().min(8).max(128) });
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const tipsterApplicationSchema = z.object({
  name: z.string().min(2).max(100), email: z.string().email(), password: z.string().min(8).max(128),
  username: z.string().min(3).max(40), country: z.string().max(100).optional(), bio: z.string().min(20).max(1000),
  experience: z.string().max(500).optional(), expertise: z.array(z.string().min(1).max(80)).default([]),
  profilePhoto: z.string().url().optional().or(z.literal("")), socialLinks: z.array(z.string().url()).default([]),
  samplePrediction: z.object({ fixture: z.string().min(3).max(200), league: z.string().max(120).optional(), prediction: z.string().min(2).max(200), odds: z.coerce.number().min(1), confidence: z.coerce.number().min(0).max(100).optional(), analysis: z.string().min(20).max(3000) })
});


function cookieOptions(): import("express").CookieOptions {
  const sameSite: "none" | "lax" = env.NODE_ENV === "production" ? "none" : "lax";
  return { httpOnly: true, secure: env.NODE_ENV === "production", sameSite, path: "/api/v1/auth" };
}

authRouter.post("/register", async (req, res) => {
  const data = registerSchema.parse(req.body); const email = data.email.toLowerCase();
  if (await User.exists({ email })) return res.status(409).json({ message: "Email already registered" });
  const user = await User.create({ name: data.name, email, passwordHash: await bcrypt.hash(data.password, 12) });
  await sendWelcomeEmail(user.email,user.name).catch(()=>false); res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});


authRouter.post("/tipster-apply", async (req, res) => {
  const data = tipsterApplicationSchema.parse(req.body); const email = data.email.toLowerCase();
  if (await User.exists({ email })) return res.status(409).json({ message: "Email already registered. Sign in and contact support to submit a tipster application." });
  if (await TipsterApplication.exists({ username: data.username })) return res.status(409).json({ message: "Tipster username already in use" });
  const user = await User.create({ name: data.name, email, passwordHash: await bcrypt.hash(data.password, 12), role: "user", status: "suspended" });
  const application = await TipsterApplication.create({ userId: user._id, username: data.username, country: data.country, bio: data.bio, experience: data.experience, expertise: data.expertise, profilePhoto: data.profilePhoto, socialLinks: data.socialLinks, samplePrediction: data.samplePrediction, status: "pending" });
  const admins=await User.find({role:'admin',status:'active'}).select('_id'); await Notification.insertMany(admins.map(a=>({userId:a._id,type:'tipster',title:'New tipster application',message:`@${application.username} submitted a tipster application for review.`,link:'/tipsters/applications'}))); await sendTipsterApplicationSubmittedEmail(user.email,user.name).catch(()=>false); res.status(201).json({ message: "Tipster application submitted for admin approval", applicationId: application.id, status: application.status });
});

authRouter.post("/login", async (req, res) => {
  const data = loginSchema.parse(req.body);
  const user = await User.findOne({ email: data.email.toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ message: "Invalid email or password" });
  // Tipster applications must be approved before the applicant can sign in.
  // Keep this check in login as a defence-in-depth measure for applications
  // created before the pending-account fix, where the User record may still
  // have status=active.
  if (user.role !== "tipster") {
    const application = await TipsterApplication.findOne({
      userId: user._id,
      status: { $in: ["pending", "under_review", "more_info", "suspended"] }
    }).select("status");
    if (application) {
      return res.status(403).json({
        message: `Tipster application is ${application.status.replace("_", " ")}. Admin approval is required before you can sign in as a tipster.`
      });
    }
  }

  if (user.status !== "active") return res.status(403).json({ message: "Account is not active" });

  const placeholder = await Session.create({ userId: user._id, tokenHash: "pending-" + Date.now(), expiresAt: new Date(Date.now() + 7*86400000), userAgent: req.get("user-agent"), ip: req.ip });
  const refreshToken = signRefreshToken(user.id, placeholder.id);
  placeholder.tokenHash = hashToken(refreshToken); await placeholder.save();
  res.cookie("refreshToken", refreshToken, { ...cookieOptions(), maxAge: 7*86400000 });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken: signAccessToken(user.id, user.role, placeholder.id) });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ message: "Refresh session required" });
  try {
    const payload = verifyRefreshToken(token);
    const session = await Session.findById(payload.sid);
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.tokenHash !== hashToken(token)) return res.status(401).json({ message: "Session expired or revoked" });
    const user = await User.findById(payload.sub);
    if (!user || user.status !== "active") return res.status(401).json({ message: "Account is not active" });
    if (user.role !== 'tipster') {
      const application = await TipsterApplication.findOne({userId:user._id,status:{$in:['pending','under_review','more_info','suspended']}}).select('status');
      if (application) return res.status(401).json({message:`Tipster application is ${application.status.replace('_',' ')}. Admin approval is required before you can continue.`});
    }
    session.revokedAt = new Date(); await session.save();
    const replacement = await Session.create({ userId: user._id, tokenHash: "pending-" + Date.now(), expiresAt: new Date(Date.now() + 7*86400000), userAgent: req.get("user-agent"), ip: req.ip });
    const newRefresh = signRefreshToken(user.id, replacement.id);
    replacement.tokenHash = hashToken(newRefresh); await replacement.save();
    res.cookie("refreshToken", newRefresh, { ...cookieOptions(), maxAge: 7*86400000 });
    res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, accessToken: signAccessToken(user.id, user.role, replacement.id) });
  } catch { res.status(401).json({ message: "Invalid refresh session" }); }
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) { try { const p = verifyRefreshToken(token); await Session.findByIdAndUpdate(p.sid, { revokedAt: new Date() }); } catch {} }
  res.clearCookie("refreshToken", cookieOptions());
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await User.findById(req.user!.id).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user });
});