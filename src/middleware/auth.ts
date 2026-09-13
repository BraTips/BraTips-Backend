import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { User, type UserRole } from "../models/User";

export interface AuthRequest extends Request { user?: { id: string; role: UserRole }; }

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "Authentication required" });
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_ACCESS_SECRET) as { sub: string; role: UserRole; type?: string };
    if (payload.type !== "access") return res.status(401).json({ message: "Invalid access token" });
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch { return res.status(401).json({ message: "Invalid or expired token" }); }
}
export function requireRole(...roles: UserRole[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    const user = await User.findById(req.user.id).select("_id status role");
    if (!user || user.status !== "active" || user.role !== req.user.role) return res.status(403).json({ message: "User is not active" });
    next();
  };
}