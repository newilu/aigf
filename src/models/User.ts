// src/models/User.ts
import mongoose from "mongoose";

export interface IUser {
  userId: number;
  inputPeer: { userId: string; accessHash: string };
  incomeLevel: "low" | "medium" | "high" | "unknown";
  dialogState: "greeting" | "questions" | "summary" | "dialog";
  questionsAsked: number;
  answers: string[];
  summaries: string[];
  summaryMessagesCount: number;
  lastMessages: string[];
  batchMessages: string[];
  batchDeadline?: Date;
  awayMessages: string[];
  awayUntil?: number;
  isAway: boolean;
  stateTransitioning?: boolean;
}

function limitArray(limit: number) {
  return (arr: any[]) => arr.length <= limit;
}

const userSchema = new mongoose.Schema<IUser>({
  userId: { type: Number, required: true, unique: true },
  inputPeer: {
    userId: { type: String, required: true },
    accessHash: { type: String, required: true },
  },
  incomeLevel: { type: String, enum: ["low", "medium", "high", "unknown"] },
  dialogState: {
    type: String,
    enum: ["greeting", "questions", "summary", "dialog"],
  },
  questionsAsked: { type: Number, default: 0 },
  answers: { type: [String], default: [] },
  summaries: { type: [String], default: [] },
  summaryMessagesCount: { type: Number, default: 0 },
  lastMessages: { type: [String], default: [] },
  batchMessages: {
    type: [String],
    default: [],
    validate: [limitArray(50), "Too many batch messages"],
  },
  batchDeadline: { type: Date },
  awayMessages: {
    type: [String],
    default: [],
    validate: [limitArray(50), "Too many away messages"],
  },
  awayUntil: { type: Number },
  isAway: { type: Boolean, default: false },
  stateTransitioning: { type: Boolean, default: false },
});

userSchema.index({ userId: 1 });
userSchema.index({ batchDeadline: 1 });
userSchema.index({ awayUntil: 1 });

export const UserModel = mongoose.model<IUser>("User", userSchema);
