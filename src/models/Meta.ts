// src/models/Meta.ts
import mongoose from "mongoose";

export interface IMeta {
  lastUpdateId: number;
}

const metaSchema = new mongoose.Schema<IMeta>({
  lastUpdateId: { type: Number, default: 0 },
});

export const MetaModel = mongoose.model<IMeta>("Meta", metaSchema);
