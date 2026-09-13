"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../config/database");
const env_1 = require("../config/env");
const User_1 = require("../models/User");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
async function main() {
    await (0, database_1.connectDatabase)();
    const email = env_1.env.ADMIN_BOOTSTRAP_EMAIL.toLowerCase();
    const hash = await bcryptjs_1.default.hash(env_1.env.ADMIN_BOOTSTRAP_PASSWORD, 12);
    const user = await User_1.User.findOneAndUpdate({ email }, { $set: { name: env_1.env.ADMIN_BOOTSTRAP_NAME, passwordHash: hash, role: "admin", status: "active" } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    console.log(`Admin ready: ${user.email} (${user.id})`);
    await (0, database_1.disconnectDatabase)();
}
main().catch(async (e) => { console.error(e); await (0, database_1.disconnectDatabase)(); process.exit(1); });
