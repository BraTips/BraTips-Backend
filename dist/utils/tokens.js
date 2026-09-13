"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.hashToken = hashToken;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function signAccessToken(userId, role) {
    return jsonwebtoken_1.default.sign({ sub: userId, role, type: "access" }, env_1.env.JWT_ACCESS_SECRET, {
        expiresIn: env_1.env.ACCESS_TOKEN_EXPIRES_IN
    });
}
function signRefreshToken(userId, sessionId) {
    return jsonwebtoken_1.default.sign({ sub: userId, sid: sessionId, type: "refresh" }, env_1.env.JWT_REFRESH_SECRET, {
        expiresIn: env_1.env.REFRESH_TOKEN_EXPIRES_IN
    });
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.env.JWT_REFRESH_SECRET);
}
function hashToken(token) {
    return crypto_1.default.createHash("sha256").update(token).digest("hex");
}
