import crypto from "crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../models/User";

export function signAccessToken(userId: string, role: UserRole, sessionId: string) {
  return jwt.sign({ sub: userId, role, sid: sessionId, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"]
  });
}
export function signRefreshToken(userId: string, sessionId: string) {
  return jwt.sign({ sub: userId, sid: sessionId, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"]
  });
}
export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string; sid: string; type: "refresh" };
}
export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}