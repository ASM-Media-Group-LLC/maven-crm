// login.js — UNA sola vez, en TU compu (local). Genera el TELEGRAM_SESSION para el
// gateway. NO va al servidor; corrés esto, copiás el string que imprime y lo pegás
// como secreto TELEGRAM_SESSION en Dokploy (NUNCA al repo ni al chat).
//
// Uso:
//   cd infra/telegram-gateway && npm install
//   TELEGRAM_API_ID=123456 TELEGRAM_API_HASH=abc... node login.js
//
// Te va a pedir: teléfono (con +código de país) → código que te llega por Telegram →
// password 2FA (si tenés; si no, enter). Al final imprime el session string.

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require("readline");

const apiId = Number(process.env.TELEGRAM_API_ID || 0);
const apiHash = process.env.TELEGRAM_API_HASH || "";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

(async () => {
  if (!apiId || !apiHash) {
    console.error("Seteá TELEGRAM_API_ID y TELEGRAM_API_HASH (de https://my.telegram.org).");
    process.exit(1);
  }
  const client = new TelegramClient(new StringSession(""), apiId, apiHash, { connectionRetries: 5 });
  await client.start({
    phoneNumber: async () => await ask("Teléfono (con +código país, ej +57...): "),
    password: async () => await ask("Password 2FA (enter si no tenés): "),
    phoneCode: async () => await ask("Código que te llegó: "),
    onError: (err) => console.error(err),
  });
  console.log("\n✅ Listo. Copiá ESTE string como secreto TELEGRAM_SESSION en Dokploy");
  console.log("   (NO lo pegues en el chat ni lo commitees):\n");
  console.log(client.session.save());
  console.log("");
  await client.disconnect();
  rl.close();
  process.exit(0);
})();
