// SIMULACRO — tiempo real del Messenger (lo que el equipo siente como «no me
// llegó el mensaje»). Cada chatter abre la conexión en vivo de su grupo,
// manda mensajes y mide cuánto tarda en volverle por el canal en vivo.
// Si la red se cae (cortes / sin internet), la sesión termina y la vuelta
// siguiente reconecta: medimos cuánto tarda en volver a estar en línea.
import http from "k6/http";
import ws from "k6/ws";
import { Trend, Rate, Counter } from "k6/metrics";
import exec from "k6/execution";

const URL = __ENV.SIM_URL, ANON = __ENV.SIM_ANON, PASS = __ENV.SIM_PASS;
if (!URL || URL.includes("lsagslbkliprespbyhts")) throw new Error("El simulacro nunca corre contra producción");

const entrega = new Trend("rt_entrega_ms", true);       // mensaje enviado → llega por el canal en vivo
const union = new Trend("rt_union_ms", true);           // abrir canal → listo
const unionOk = new Rate("rt_union_ok");
const llego = new Rate("rt_mensaje_llego");             // de los enviados, cuántos llegaron por el canal
const caidas = new Counter("rt_caidas");
const reconexion = new Trend("rt_reconexion_ms", true); // caída → de nuevo en línea

const PARTES = parseInt(__ENV.PARTES || "1"), PARTE = parseInt(__ENV.PARTE || "0");
const CHATTERS = [];
for (let n = 218; n <= 745; n++) if (n % PARTES === PARTE) CHATTERS.push(n);

export const options = {
  scenarios: { vivo: { executor: "constant-vus", vus: parseInt(__ENV.VUS || "30"), duration: __ENV.DURACION || "8m" } },
  summaryTrendStats: ["avg", "p(50)", "p(95)", "p(99)", "max", "count"],
};

const yo = {};

export default function () {
  const vu = exec.vu.idInTest;
  const n = CHATTERS[(vu - 1) % CHATTERS.length];
  if (!yo[vu]) {
    const r = http.post(`${URL}/auth/v1/token?grant_type=password`,
      JSON.stringify({ email: `sim${String(n).padStart(4, "0")}@simulacro.maven.test`, password: PASS }),
      { headers: { apikey: ANON, "Content-Type": "application/json" }, timeout: "30s" });
    if (r.status !== 200) return;
    const d = r.json();
    const c = http.get(`${URL}/rest/v1/chat_participants?select=conversation_id&user_id=eq.${d.user.id}`,
      { headers: { apikey: ANON, Authorization: `Bearer ${d.access_token}` }, timeout: "30s" });
    const convs = c.status === 200 ? c.json().map((x) => x.conversation_id) : [];
    if (!convs.length) return;
    yo[vu] = { token: d.access_token, uid: d.user.id, conv: convs[convs.length > 1 ? 1 : 0], caidoDesde: null };
  }
  const e = yo[vu];
  const wsUrl = `${URL.replace("https", "wss")}/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`;
  const t0 = Date.now();
  let unido = false;
  const pendientes = {};
  const res = ws.connect(wsUrl, { timeout: "20s" }, (s) => {
    let ref = 1;
    s.on("open", () => {
      s.send(JSON.stringify({ topic: `realtime:sim-${e.conv}`, event: "phx_join", ref: String(ref++), join_ref: "1",
        payload: { config: { broadcast: { self: false }, presence: { key: "" },
          postgres_changes: [{ event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${e.conv}` }] },
          access_token: e.token } }));
    });
    s.on("message", (raw) => {
      let m; try { m = JSON.parse(raw); } catch (_) { return; }
      if (m.event === "phx_reply" && m.payload && m.payload.status === "ok" && !unido) {
        unido = true; union.add(Date.now() - t0); unionOk.add(true);
        if (e.caidoDesde) { reconexion.add(Date.now() - e.caidoDesde); e.caidoDesde = null; }
      }
      if (m.event === "postgres_changes" && m.payload && m.payload.data) {
        const txt = (m.payload.data.record || {}).content || "";
        if (pendientes[txt]) { entrega.add(Date.now() - pendientes[txt]); llego.add(true); delete pendientes[txt]; }
      }
    });
    s.setInterval(() => s.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(ref++) })), 25000);
    s.setInterval(() => {
      if (!unido) return;
      const txt = `rt ${vu} ${Date.now()}`;
      pendientes[txt] = Date.now();
      http.post(`${URL}/rest/v1/chat_messages`, JSON.stringify({ conversation_id: e.conv, sender_id: e.uid, content: txt, type: "text" }),
        { headers: { apikey: ANON, Authorization: `Bearer ${e.token}`, "Content-Type": "application/json", Prefer: "return=minimal" }, timeout: "20s" });
    }, 20000 + Math.random() * 10000);
    s.setTimeout(() => s.close(), 120000); // sesiones de 2 min y se vuelve a abrir
    s.on("close", () => {
      for (const k of Object.keys(pendientes)) llego.add(false);
    });
    s.on("error", () => {});
  });
  if (!unido) { unionOk.add(false); }
  if (!res || res.status !== 101 || (Date.now() - t0) < 110000) {
    // la sesión terminó antes de tiempo: contó como caída
    caidas.add(1);
    if (!e.caidoDesde) e.caidoDesde = Date.now();
  }
}

export function handleSummary(data) {
  return { [__ENV.SALIDA || "/resultados/rt.json"]: JSON.stringify({ region: __ENV.REGION, cond: __ENV.COND, metricas: data.metrics }) };
}
