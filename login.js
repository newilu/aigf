// src/login.ts (или .js)
require("dotenv").config();
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require("readline");

const apiId = parseInt(process.env.TELEGRAM_API_ID || "", 10);
const apiHash = process.env.TELEGRAM_API_HASH || "";
const phone = process.env.TELEGRAM_PHONE_NUMBER || "";
const session = new StringSession("");

(async () => {
  console.log("⚡ Запуск процесса входа в Telegram…");
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  await client.start({
    phoneNumber: async () =>
      phone || (await new Promise((r) => rl.question("Номер телефона: ", r))),
    password: async () =>
      await new Promise((r) => rl.question("Пароль 2FA: ", r)),
    phoneCode: async () =>
      await new Promise((r) => rl.question("Код из Telegram: ", r)),
    onError: (err) => console.error(err),
  });

  console.log("✅ Успешно вошли в аккаунт.");
  console.log("Сохраните эту строку сессии:");
  console.log(client.session.save());
  rl.close();
  process.exit(0);
})();
