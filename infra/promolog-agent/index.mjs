// index.mjs — entrada CLI del scanner. Corre las cuentas en secuencia y loguea a
// consola. La lógica vive en agent-core.mjs (compartida con la GUI ui.mjs).
// Para la interfaz gráfica: `npm run ui` (o doble clic en abrir-panel.command).

import { ACCOUNTS, assertConfig } from "./config.mjs";
import { runAccount, sleep } from "./agent-core.mjs";

assertConfig();

(async () => {
  console.log(`Promolog agent — ${new Date().toISOString()} — cuentas: ${ACCOUNTS.map((a) => a.slot).join(", ")}`);
  for (const acct of ACCOUNTS) {
    try { await runAccount(acct, { log: (m) => console.log("   " + m) }); }
    catch (e) { console.error(`slot ${acct.slot} fallo:`, e.message); }
    await sleep(5000 + Math.random() * 5000);
  }
  console.log("Listo.");
  process.exit(0);
})();
