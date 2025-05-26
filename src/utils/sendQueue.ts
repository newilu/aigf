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

const PIC_URLS = [
  "https://files.catbox.moe/k5hec2.jpeg",
  "https://files.catbox.moe/u2ipvo.jpeg",
  "https://files.catbox.moe/zmk1iv.jpeg",
  "https://files.catbox.moe/lcktvv.jpeg",
  "https://files.catbox.moe/bx4vy8.jpeg",
  "https://files.catbox.moe/g8tbew.jpeg",
];

export function enqueueSend(
  peer: any,
  messages: string[],
  user: IUser,
): Promise<void> {
  const msgQueue: string[] = [];
  for (const msg of messages) {
    msgQueue.push(
      // Регулярка: разделяет по тегам END_MSG и по двойному переносу строки (\n\n и вариациям с пробелами)
      ...msg
        .split(/(\[?END_MSG\]?|\r?\n\s*\r?\n)/gi)
        .map((s) => s.trim()) // обрезаем пробелы
        .filter(
          (s) =>
            !!s && // НЕ пустая строка
            !/^\[?END_MSG\]?$/i.test(s), // НЕ сам тег END_MSG
        ),
    );
  }

  return new Promise<void>((resolve) => {
    sendQueue.push({ peer, messages: msgQueue, user, resolve });
    if (!isProcessing) processQueue();
  });
}

const photoIndexes = new Map<number, number>(); // userId -> index

async function processQueue() {
  isProcessing = true;
  while (sendQueue.length) {
    const { peer, messages, user, resolve } = sendQueue.shift()!;
    // user.userId обязательно должен быть числом
    const userId = user.userId as number;
    for (const message of messages) {
      if (message.includes("[pics]")) {
        const caption = message.replace("[pics]", "").trim();

        // Получаем индекс текущей фотки для юзера
        let idx = photoIndexes.get(userId) ?? 0;
        const photoUrl = PIC_URLS[idx];
        // Обновляем индекс (по кругу)
        photoIndexes.set(userId, (idx + 1) % PIC_URLS.length);

        await tgClient.invoke(
          new Api.messages.SetTyping({
            peer,
            action: new Api.SendMessageUploadPhotoAction({ progress: 100 }),
          }),
        );
        await delay(2500);
        await tgClient.sendFile(peer, {
          file: photoUrl,
          caption: caption || undefined,
        });
        await delay(3000);
        continue;
      }

      // Обычное текстовое сообщение
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
    resolve();
  }
  isProcessing = false;
}
