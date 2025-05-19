// src/config/telegram.ts
// Telegram client
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import {
  TELEGRAM_API_HASH,
  TELEGRAM_API_ID,
  TELEGRAM_SESSION,
} from "../constants/telegram";

const tgClient = new TelegramClient(
  new StringSession(TELEGRAM_SESSION),
  TELEGRAM_API_ID,
  TELEGRAM_API_HASH,
  { connectionRetries: 5 },
);

export { tgClient };
