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
  QUESTIONS,
  QUESTIONS_INIT_MESSAGE,
  PHOTO_WARM_UP_MESSAGE,
  SYSTEM_PROMPT_1,
  SYSTEM_PROMPT_2,
  HISTORY_WINDOW,
  SUMMARY_THRESHOLD,
  BATCH_DELAY_MS,
} from "./constants/bot";
import { MONGODB_URI } from "./constants/mongo";
import { delay } from "./utils/helpers";
import { getCachedPeer } from "./utils/telegramCache";
import { enqueueSend } from "./utils/sendQueue";
import SendMessageUploadPhotoAction = Api.SendMessageUploadPhotoAction;

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PHOTO_URL = "https://files.catbox.moe/k5hec2.jpeg";

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
  const now = Date.now();
  if (user.awayUntil && now < user.awayUntil) {
    user.awayMessages.push(text);
    //@ts-ignore
    await user.save();
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

  const peer = await getCachedPeer(user.userId);
  await tgClient.invoke(new Api.messages.ReadHistory({ peer }));

  switch (user.dialogState) {
    case "greeting": {
      user.stateTransitioning = true;
      //@ts-ignore
      await user.save();
      const replies = await generateBotReply({
        history: user.lastMessages,
        summaries: user.summaries,
        prompt: SYSTEM_PROMPT_1,
      });
      await sendTgMessages(peer, replies, user);
      user.lastMessages.push(`BOT: ${replies.join("\n")}`);
      await delay(3000);
      await sendTgMessages(peer, [QUESTIONS_INIT_MESSAGE, QUESTIONS[0]], user);
      user.questionsAsked = 1;
      user.dialogState = "questions";
      user.stateTransitioning = false;
      break;
    }
    case "questions": {
      user.answers.push(text);
      if (user.questionsAsked >= 3) {
        user.stateTransitioning = true;
        //@ts-ignore
        await user.save();
        const replies = await generateBotReply({
          history: user.answers,
          prompt: SYSTEM_PROMPT_2,
        });
        await sendTgMessages(peer, replies, user);
        await delay(10_000);
        await tgClient.invoke(
          new Api.messages.SetTyping({
            peer,
            action: new SendMessageUploadPhotoAction({ progress: 100 }),
          }),
        );
        await delay(3000);
        await tgClient.sendFile(user.userId, { file: PHOTO_URL });
        await delay(3000);
        await sendTgMessages(peer, [PHOTO_WARM_UP_MESSAGE], user);

        user.dialogState = "dialog";
        user.stateTransitioning = false;
      } else {
        if (user.questionsAsked === 1) {
          await sendTgMessages(peer, ["🤔"], user);
          await delay(2000);
        }
        await sendTgMessages(peer, [QUESTIONS[user.questionsAsked]], user);
        user.questionsAsked++;
      }
      break;
    }
    case "dialog":
      break;
  }
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
}, 1000);
(async () => {
  // @ts-ignore
  await tgClient.start({ onError: console.error });
  console.log("🤖 Telegram bot started");
})();
