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

// Polling adaptativo: si la queue está vacía VARIOS ciclos seguidos,
// dormimos más tiempo entre polls. Apenas aparece trabajo, volvemos al
// intervalo rápido. Evita 5.760 polls vacíos/día cuando no hay tráfico.
const POLL_MS_FAST = parseInt(process.env.WORKER_POLL_INTERVAL_MS ?? "15000", 10);
const POLL_MS_SLOW = parseInt(process.env.WORKER_POLL_INTERVAL_SLOW_MS ?? "60000", 10);
const IDLE_THRESHOLD = parseInt(process.env.WORKER_IDLE_THRESHOLD ?? "5", 10);

let running = true;
let idleStreak = 0;

async function loop(): Promise<void> {
  console.log(`scouter-worker arrancando (poll ${POLL_MS_FAST}ms fast / ${POLL_MS_SLOW}ms slow tras ${IDLE_THRESHOLD} vacíos)…`);
  while (running) {
    try {
      const processed = await drainBatch();
      if (processed === 0) {
        idleStreak++;
        const interval = idleStreak >= IDLE_THRESHOLD ? POLL_MS_SLOW : POLL_MS_FAST;
        await sleep(interval);
      } else {
        // Hubo trabajo — resetear el contador y polear rápido por si
        // hay más jobs esperando (e.g. discover enqueueó N score_lead).
        idleStreak = 0;
        await sleep(500);
      }
    } catch (e) {
      console.error("loop tick error", e);
      idleStreak = 0; // ante error, no entrar en modo slow
      await sleep(POLL_MS_FAST);
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
