import { Schema, model, type Document } from "mongoose";

export type UserRole = "user" | "admin" | "tipster";
export type UserStatus = "active" | "suspended";

export interface IUser extends Document {
  email: string; passwordHash: string; name: string;
  role: UserRole; status: UserStatus; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  role: { type: String, enum: ["user", "admin", "tipster"], default: "user", index: true },
  status: { type: String, enum: ["active", "suspended"], default: "active", index: true }
}, { timestamps: true });
export const User = model<IUser>("User", schema);