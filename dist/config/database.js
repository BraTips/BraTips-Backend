"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
const mongoose_1 = __importDefault(require("mongoose"));
const env_1 = require("./env");
async function connectDatabase() {
    mongoose_1.default.connection.on("connected", () => console.log("MongoDB connected"));
    mongoose_1.default.connection.on("error", (err) => console.error("MongoDB error:", err));
    await mongoose_1.default.connect(env_1.env.MONGODB_URI);
}
async function disconnectDatabase() { await mongoose_1.default.disconnect(); }
