// src/utils/sendQueue.ts
import { tgClient } from "../config/telegram";
import { delay } from "./helpers";
import { Api } from "telegram";
import { IUser } from "../models/User";

interface SendTask {
  peer: any;
  messages: string[];
  user: IUser;
  resolve: () => void;
}

const sendQueue: SendTask[] = [];
let isProcessing = false;

export function enqueueSend(
  peer: any,
  messages: string[],
  user: IUser,
): Promise<void> {
  // распаковываем чанки
  const msgQueue: string[] = [];
  for (const msg of messages) {
    msgQueue.push(
      ...msg
        .split("[END_MSG]")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }

  return new Promise<void>((resolve) => {
    sendQueue.push({ peer, messages: msgQueue, user, resolve });
    if (!isProcessing) processQueue();
  });
}

async function processQueue() {
  isProcessing = true;
  while (sendQueue.length) {
    const { peer, messages, user, resolve } = sendQueue.shift()!;
    for (const message of messages) {
      const baseDelay = message.length > 15 ? 8000 : 3000;
      await tgClient.invoke(
        new Api.messages.SetTyping({
          peer,
          action: new Api.SendMessageTypingAction(),
        }),
      );
      await delay(baseDelay);
      await tgClient.sendMessage(peer, { message });
    }
    // Всё чанки для этой задачи ушли — размораживаем caller
    resolve();
  }
  isProcessing = false;
}
