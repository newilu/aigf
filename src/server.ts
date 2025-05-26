import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { Api } from "telegram";
import { tgClient } from "./config/telegram";
import { UserModel, IUser } from "./models/User";
import { generateBotReply } from "./handlers/openai/generateBotReply";
import { summarizeConversation } from "./handlers/openai/summarizeConversation";
import {
  PROMPT_LIST,
  HISTORY_WINDOW,
  SUMMARY_THRESHOLD,
  BATCH_DELAY_MS,
  AFTER_AWAY_PROMPT,
  RAZVOD_PROMPT,
  AWAY_TIMEOUT_MS,
} from "./constants/bot";
import { MONGODB_URI } from "./constants/mongo";
import { delay } from "./utils/helpers";
import { getCachedPeer } from "./utils/telegramCache";
import { enqueueSend } from "./utils/sendQueue";

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 3000);

mongoose
  .connect(MONGODB_URI, { maxPoolSize: 50 })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

app.get("/", (_req, res) => res.send("Bot server is running!"));
app.listen(PORT, () => console.log(`🌐 Server running on port ${PORT}`));

async function sendTgMessages(
  peer: any,
  messages: string[],
  user: IUser,
): Promise<void> {
  await enqueueSend(peer, messages, user);
}

const processUserText = async (user: IUser, text: string) => {
  console.log(user);
  const now = Date.now();
  if (user.awayUntil && now < user.awayUntil) {
    user.awayMessages.push(text);
    //@ts-ignore
    await user.save();
    return;
  }

  if (user.messageCount >= 14) {
    user.isAway = true;
    user.awayUntil = now + 24 * 60 * 60 * 1000;
    //@ts-ignore
    user.save();
    return;
  }

  user.lastMessages.push(text);
  if (user.lastMessages.length > HISTORY_WINDOW) user.lastMessages.shift();

  user.summaryMessagesCount++;
  if (user.summaryMessagesCount >= SUMMARY_THRESHOLD) {
    const convo = user.lastMessages.map((msg) => ({
      role: msg.startsWith("BOT:") ? "assistant" : "user",
      content: msg,
    }));
    const summary = await summarizeConversation(convo);
    user.summaries.push(summary);
    user.summaryMessagesCount = 0;
  }

  const prompt = PROMPT_LIST[Math.floor(Math.random() * PROMPT_LIST.length)];

  const peer = await getCachedPeer(user.userId);
  await tgClient.invoke(new Api.messages.ReadHistory({ peer }));

  switch (user.dialogState) {
    case "dialog":
      user.stateTransitioning = true;
      //@ts-ignore
      await user.save();
      user.messageCount += 1;
      if (user.messageCount === 8) {
        const replies = await generateBotReply({
          history: user.lastMessages,
          summaries: user.summaries,
          prompt: AFTER_AWAY_PROMPT,
        });
        await sendTgMessages(peer, replies, user);
        user.lastMessages.push(`BOT: ${replies.join("\n")}`);
      } else if (user.messageCount > 12) {
        const replies = await generateBotReply({
          history: user.lastMessages,
          summaries: user.summaries,
          prompt: RAZVOD_PROMPT,
        });
        await sendTgMessages(peer, replies, user);
        user.lastMessages.push(`BOT: ${replies.join("\n")}`);
      } else if (user.messageCount === 7) {
        user.isAway = true;
        user.awayUntil = Date.now() + AWAY_TIMEOUT_MS;
        await sendTgMessages(
          peer,
          [
            "ooh, sorryy, gotta run  [END_MSG] \n" +
              "chatting with you was funn  [END_MSG] \n" +
              "let’s vibe later, oky?  [END_MSG]",
          ],
          user,
        );
      } else {
        const replies = await generateBotReply({
          history: user.lastMessages,
          summaries: user.summaries,
          prompt,
        });
        await sendTgMessages(peer, replies, user);
        user.lastMessages.push(`BOT: ${replies.join("\n")}`);

        const emojiList = ["😊", "😉", "😏", "😇"];

        if (prompt === PROMPT_LIST[1] && Math.random() < 0.7) {
          await sendTgMessages(
            peer,
            [emojiList[Math.floor(Math.random() * emojiList.length)]],
            user,
          );
        }
      }

      break;
  }
  user.stateTransitioning = false;

  //@ts-ignore
  await user.save();
};

tgClient.addEventHandler(async (event) => {
  if (!(event instanceof Api.UpdateTranscribedAudio)) return;

  const { peer, text, pending } = event;
  if (pending || !text) return;
  const newPeer = (await tgClient.getInputEntity(peer)) as any;

  try {
    const senderId = Number(newPeer.toJSON().userId?.valueOf());
    const upsertDefaults = {
      userId: senderId,
      incomeLevel: "unknown",
      summaries: [],
      answers: [],
      lastMessages: [],
      batchMessages: [],
      awayMessages: [],
      summaryMessagesCount: 0,
      dialogState: "greeting",
      questionsAsked: 0,
      isAway: false,
    };
    const user = await UserModel.findOneAndUpdate(
      { userId: senderId },
      {
        $setOnInsert: upsertDefaults,
        $set: {
          inputPeer: {
            userId: newPeer.userId.toString(),
            accessHash: newPeer.accessHash.toString(),
          },
        },
      },
      { upsert: true, new: true },
    ).lean(false);

    user.batchMessages.push(text.trim());
    user.batchDeadline = new Date(
      Date.now() + (user.stateTransitioning ? 60000 : BATCH_DELAY_MS),
    );
    //@ts-ignore
    await user.save();
  } catch (error) {
    console.error("Error processing transcription update:", error);
  }
});

tgClient.addEventHandler(async (event: NewMessageEvent) => {
  const msg = event.message;
  const senderId = Number(msg.senderId?.valueOf());
  if (!event.isPrivate || msg.out || !senderId) return;

  const sender = await msg.getSender();
  const peer = (await tgClient.getInputEntity(sender!)) as any;

  if (msg.message === "/reset") {
    try {
      // Удаляем документ пользователя из MongoDB
      await UserModel.deleteOne({ userId: senderId });
      // Отправляем пользователю подтверждение
      await tgClient.sendMessage(peer, { message: "reset success" });
    } catch (e) {
      console.error("Reset error:", e);
      await tgClient.sendMessage(peer, { message: "reset fail" });
    }
    return; // выход, чтобы не выполнять остальную логику
  }

  // @ts-ignore
  if (msg.voice && msg.media?.toJSON().voice) {
    delay(BATCH_DELAY_MS)
      .then(() => tgClient.invoke(new Api.messages.ReadHistory({ peer })))
      .then(() =>
        tgClient.invoke(
          new Api.messages.TranscribeAudio({
            peer,
            msgId: msg.id,
          }),
        ),
      );
  }

  if (!msg.message) return;

  const upsertDefaults = {
    userId: senderId,
    incomeLevel: "unknown",
    summaries: [],
    answers: [],
    lastMessages: [],
    batchMessages: [],
    awayMessages: [],
    messageCount: 0,
    summaryMessagesCount: 0,
    dialogState: "dialog",
    questionsAsked: 0,
    isAway: false,
  };
  const user = await UserModel.findOneAndUpdate(
    { userId: senderId },
    {
      $setOnInsert: upsertDefaults,
      $set: {
        inputPeer: {
          userId: peer.userId.toString(),
          accessHash: peer.accessHash.toString(),
        },
      },
    },
    { upsert: true, new: true },
  ).lean(false);

  user.batchMessages.push(msg.message.trim());
  user.batchDeadline = new Date(
    Date.now() + (user.stateTransitioning ? 60000 : BATCH_DELAY_MS),
  );
  //@ts-ignore
  await user.save();
}, new NewMessage({}));

setInterval(async () => {
  const now = new Date();
  const users = await UserModel.find({
    batchDeadline: { $lte: now },
    batchMessages: { $ne: [] },
  });
  for (const user of users) {
    const text = user.batchMessages.join("\n");
    user.batchMessages = [];
    user.batchDeadline = undefined;
    await user.save();
    processUserText(user, text);
  }
  const awayUsers = await UserModel.find({
    awayUntil: { $lte: now },
    awayMessages: { $ne: [] },
  });
  for (const user of awayUsers) {
    const text = user.awayMessages.join("\n");
    user.awayMessages = [];
    user.awayUntil = undefined;
    await user.save();
    processUserText(user, text);
  }
}, 5_000);

(async () => {
  // @ts-ignore
  await tgClient.start({ onError: console.error });
  console.log("🤖 Telegram bot started");
})();
