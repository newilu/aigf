// src/config/openai.ts
// OpenAI client
import OpenAI from "openai";
import { OPENAI_KEY } from "../constants/openai";

const openai = new OpenAI({
  apiKey: OPENAI_KEY,
  baseURL: "https://api.x.ai/v1",
});

const model = "grok-3-mini-beta";

export { openai, model };
