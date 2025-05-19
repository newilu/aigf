// src/utils/telegramCache.ts
import { tgClient } from "../config/telegram";
import { Api } from "telegram";
import { UserModel } from "../models/User";

interface CachedPeer {
  peer: any;
  expiresAt: number;
}
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 час
const peerCache = new Map<number, CachedPeer>();

/**
 * Возвращает InputPeerUser из кэша, Mongo или Telegram
 */
export async function getCachedPeer(userId: number): Promise<any> {
  const now = Date.now();
  const cached = peerCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.peer;
  }

  // Попытка взять из Mongo
  const user = await UserModel.findOne({ userId }).lean();
  if (user?.inputPeer) {
    const peer = new Api.InputPeerUser({
      userId: BigInt(user.inputPeer.userId) as any,
      accessHash: BigInt(user.inputPeer.accessHash) as any,
    });
    peerCache.set(userId, { peer, expiresAt: now + CACHE_TTL_MS });
    return peer;
  }

  // Иначе запрашиваем у Telegram
  const newPeer = (await tgClient.getInputEntity(userId)) as any;

  // Сохраняем в Mongo
  await UserModel.updateOne(
    { userId },
    {
      $set: {
        inputPeer: {
          userId: newPeer.userId.toString(),
          accessHash: newPeer.accessHash.toString(),
        },
      },
    },
    { upsert: true },
  );

  peerCache.set(userId, { peer: newPeer, expiresAt: now + CACHE_TTL_MS });
  return newPeer;
}
