// Entry point del worker. Loop que cada N ms drena un batch de jobs
// queued. Sin queue externa (Bull, RabbitMQ) — el queue es la propia
// tabla scouter_jobs en Postgres, y el worker hace polling.
//
// Si el proceso muere mid-job, el job queda en status="running" hasta
// que un humano (o un cron de housekeeping) lo resetée. Para hoy es
// aceptable porque arrancamos con tráfico bajo y monitoreo manual; si
// cuando crezca esto se vuelve un dolor, agregar un script que mueva
// "running con started_at > 10 min" → "queued" para retry.

import { drainBatch } from "./queue.ts";

const POLL_MS = parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? "15000", 10);

let running = true;

async function loop(): Promise<void> {
  console.log(`scouter-worker arrancando (poll cada ${POLL_MS}ms)…`);
  while (running) {
    try {
      const processed = await drainBatch();
      if (processed === 0) {
        // No había nada que hacer, dormimos hasta el siguiente tick.
        await sleep(POLL_MS);
      } else {
        // Si encontramos jobs y los procesamos, intentamos de nuevo
        // inmediatamente — puede haber más esperando (e.g. discover
        // enqueueó N score_lead).
        await sleep(500);
      }
    } catch (e) {
      console.error("loop tick error", e);
      await sleep(POLL_MS);
    }
  }
  console.log("scouter-worker detenido.");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Graceful shutdown — cuando Dokploy mande SIGTERM al re-deploy,
// terminamos el job en curso y salimos limpios.
process.on("SIGTERM", () => {
  console.log("SIGTERM recibido, cerrando loop después del job actual…");
  running = false;
});
process.on("SIGINT", () => {
  console.log("SIGINT recibido, cerrando loop…");
  running = false;
});

loop().catch((e) => {
  console.error("loop fatal", e);
  process.exit(1);
});
