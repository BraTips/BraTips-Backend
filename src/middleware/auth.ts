import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { User, type UserRole } from "../models/User";
import { Session } from "../models/Session";

export interface AuthRequest extends Request { user?: { id: string; role: UserRole }; }

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required" });
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as { sub: string; sid?: string; role: UserRole; type?: string };
    if (payload.type !== "access" || !payload.sid) return res.status(401).json({ message: "Invalid access token" });
    void Promise.all([
      Session.findOne({ _id: payload.sid, userId: payload.sub, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).select("_id"),
      User.findById(payload.sub).select("_id role status")
    ]).then(([session, user]) => {
      if (!session) return res.status(401).json({ message: "Session expired or revoked" });
      if (!user || user.status !== "active") return res.status(401).json({ message: "Account is not active" });
      req.user = { id: String(user._id), role: user.role };
      next();
    }).catch(() => res.status(401).json({ message: "Authentication failed" }));
  } catch { return res.status(401).json({ message: "Invalid or expired token" }); }
}

export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as { sub: string; sid?: string; role: UserRole; type?: string };
    if (payload.type === "access" && payload.sid) {
      void Promise.all([
        Session.findOne({ _id: payload.sid, userId: payload.sub, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }).select("_id"),
        User.findById(payload.sub).select("_id role status")
      ]).then(([session, user]) => {
        if (session && user?.status === "active") req.user = { id: String(user._id), role: user.role };
        next();
      }).catch(() => next());
      return;
    }
  } catch {}
  next();
}

export function requireRole(...roles: UserRole[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    const user = await User.findById(req.user.id).select("_id status role");
    if (!user || user.status !== "active" || user.role !== req.user.role) return res.status(403).json({ message: "User is not active" });
    next();
  };
}