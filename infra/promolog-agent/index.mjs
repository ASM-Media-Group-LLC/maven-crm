// index.mjs — entrada CLI del scanner de IG. Corre las cuentas del registro en
// secuencia (cada una su parte) y loguea a consola. La lógica vive en agent-core.
// Para la interfaz gráfica (recomendado): `npm run ui` o doble clic en abrir-panel.command.

import { runAccount, sleep } from "./agent-core.mjs";
import { accountsOf, sessionPath } from "./accounts.mjs";

(async () => {
  const accts = accountsOf("instagram");
  const count = accts.length;
  console.log(`Promolog agent (IG) — ${new Date().toISOString()} — ${count} cuenta(s): ${accts.map((a) => a.id).join(", ")}`);
  for (let i = 0; i < accts.length; i++) {
    const a = accts[i];
    const account = { id: a.id, sessionFile: sessionPath(a.session), index: i, count };
    try { await runAccount(account, { log: (m) => console.log("   " + m) }); }
    catch (e) { console.error(`cuenta ${a.id} fallo:`, e.message); }
    await sleep(5000 + Math.random() * 5000);
  }
  console.log("Listo.");
  process.exit(0);
})();
