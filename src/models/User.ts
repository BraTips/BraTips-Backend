import { Schema, model, type Document } from "mongoose";

/**
 * Account roles are mutually exclusive routing/permission roles.
 * - user: regular member, including Premium subscribers
 * - tipster: approved publisher with access to the Tipster Dashboard
 * - admin: platform administration (served by the admin application)
 *
 * Premium is intentionally NOT a role; it is determined by Subscription status.
 */
export type UserRole = "user" | "admin" | "tipster";
export type UserStatus = "active" | "suspended";

export interface IUser extends Document {
  email: string; passwordHash: string; name: string;
  role: UserRole; status: UserStatus; seeded?: boolean; createdAt: Date; updatedAt: Date;
}
const schema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  role: { type: String, enum: ["user", "admin", "tipster"], default: "user", index: true },
  status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  seeded: { type: Boolean, default: false, index: true }
}, { timestamps: true });
export const User = model<IUser>("User", schema);