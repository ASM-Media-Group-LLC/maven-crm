// SIMULACRO — una persona REAL en Chrome entrando a Cowork de Maven.
//
// Abre el Maven de prueba (servido en el VPS de pruebas, apuntando a la COPIA),
// con su cuenta de prueba ya iniciada, y entra a su sala por el enlace del
// supervisor (/cowork?session=…&room=…), con cámara y micrófono simulados por
// Chrome. Mientras está en la llamada mide, cada 5 s, lo que siente la persona:
//   · cuánto tardó en ver al primer compañero
//   · congelamientos de imagen (cuántos y cuánto tiempo)
//   · resolución que recibe y que manda (y si la baja por red o por CPU)
//   · audio cortado (muestras «inventadas» por pérdida)
//   · pérdida de paquetes, retraso (RTT) y jitter
//   · si tuvo que usar la red de respaldo (TURN) o TCP
//   · caídas de conexión y si volvió sola
// Escribe un JSON con todo y dos capturas de pantalla.
import { chromium } from "playwright";
import fs from "node:fs";
import crypto from "node:crypto";

const E = process.env;
const WEB = E.WEB || "http://localhost:8080"; // localhost:8080 está en la lista de orígenes de las funciones
const REF = new URL(E.SIM_URL).hostname.split(".")[0];
if (E.SIM_URL.includes("lsagslbkliprespbyhts")) throw new Error("Nunca contra producción");
const N = parseInt(E.PERSONA, 10);
const EMAIL = `sim${String(N).padStart(4, "0")}@simulacro.maven.test`;
const DUR = parseInt(E.DURACION_S || "240", 10) * 1000;
const SALIDA = E.SALIDA || `/resultados/nav_${N}.json`;


// PLAN B (si la copia no tiene las llaves de la réplica): el pase de llamada lo
// firma esta prueba con las llaves de la RÉPLICA (nunca las de producción).
// Todo lo demás de Maven corre igual; solo cambia quién firma el pase.
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function pase(identidad, nombre, sala) {
  const now = Math.floor(Date.now() / 1000);
  const cuerpo = { iss: E.SIM_LK_KEY, sub: identidad, iat: now, nbf: now, exp: now + 6 * 3600, name: nombre,
    video: { roomJoin: true, room: sala, canPublish: true, canSubscribe: true, canPublishData: true } };
  const t = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(cuerpo)}`;
  return `${t}.${crypto.createHmac("sha256", E.SIM_LK_SECRET).update(t).digest("base64url")}`;
}

const r = await fetch(`${E.SIM_URL}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { apikey: E.SIM_ANON, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: E.SIM_PASS }),
});
const sesion = await r.json();
if (!sesion.access_token) throw new Error("no entró: " + JSON.stringify(sesion).slice(0, 200));

const browser = await chromium.launch({
  args: [
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    // «localhost» → el Maven de prueba en este mismo servidor (puerto 8080).
    `--host-resolver-rules=MAP localhost ${E.HOST_WEB || "172.17.0.1"}`,
    "--autoplay-policy=no-user-gesture-required", "--no-sandbox",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera", "microphone"] });
await ctx.addInitScript(() => {
  window.__pcs = [];
  window.__estados = [];
  const O = window.RTCPeerConnection;
  function P(...a) {
    const pc = new O(...a);
    window.__pcs.push(pc);
    pc.addEventListener("connectionstatechange", () => window.__estados.push([Date.now(), pc.connectionState]));
    return pc;
  }
  P.prototype = O.prototype;
  Object.setPrototypeOf(P, O);
  window.RTCPeerConnection = P;
});
const page = await ctx.newPage();
if (E.MODO_PASE === "plan_b") {
  const salaR = await fetch(`${E.SIM_URL}/rest/v1/cowork_rooms?select=livekit_room_name&id=eq.${E.ROOM}`,
    { headers: { apikey: E.SIM_ANON, Authorization: `Bearer ${sesion.access_token}` } });
  const salaLk = ((await salaR.json())[0] || {}).livekit_room_name;
  const uid = sesion.user.id, nombre = (sesion.user.user_metadata || {}).full_name || EMAIL;
  const lkUrl = E.SIM_LK_URL || "ws://144.126.155.175:7880";
  await page.route("**/functions/v1/cowork-session", async (route) => {
    let b = {}; try { b = route.request().postDataJSON() || {}; } catch (_) {}
    if (b.action === "issueLiveKitToken" && salaLk) {
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ token: pase(`${uid}_${b.clientId || "t"}`, nombre, salaLk), url: lkUrl, room: salaLk }) });
    }
    return route.continue();
  });
  await page.route("**/functions/v1/livekit-token", async (route) => {
    let b = {}; try { b = route.request().postDataJSON() || {}; } catch (_) {}
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ token: pase(`${uid}_lk`, nombre, b.roomName || salaLk), url: lkUrl }) });
  });
}
const consola = [];
page.on("console", (m) => { if (/reconnect|disconnect|error/i.test(m.text())) consola.push([Date.now(), m.type(), m.text().slice(0, 200)]); });

await page.goto(WEB + "/", { waitUntil: "domcontentloaded" });
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(sesion)]);
const t0 = Date.now();
await page.goto(`${WEB}/cowork?session=${E.SESSION}&room=${E.ROOM}`, { waitUntil: "domcontentloaded" });

// Como una persona al llegar: prende cámara y micrófono (arrancan apagados).
let prendio = { camara: false, micro: false };
for (let i = 0; i < 30 && !(prendio.camara && prendio.micro); i++) {
  await page.waitForTimeout(1500);
  for (const [k, sel] of [["camara", 'button[title="Cámara"], button[title="Camera"]'], ["micro", 'button[title="Micrófono"], button[title="Microphone"]']]) {
    if (prendio[k]) continue;
    const b = page.locator(sel).last();
    if (await b.count().catch(() => 0)) {
      const clase = (await b.getAttribute("class").catch(() => "")) || "";
      if (clase.includes("bg-destructive")) await b.click().catch(() => {});
      else prendio[k] = true;
    }
  }
}
if (E.COMPARTIR_PANTALLA === "1") {
  await page.locator('button[title*="antalla"], button[title*="creen"]').first().click().catch(() => {});
}

const muestras = [];
let primerVideo = null;
const fin = t0 + DUR;
let n = 0;
while (Date.now() < fin) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(async () => {
    const out = { inV: [], inA: [], outV: [], par: null, estado: window.__pcs.map((p) => p.connectionState) };
    for (const pc of window.__pcs) {
      if (pc.connectionState === "closed") continue;
      const st = await pc.getStats();
      const cands = {};
      st.forEach((x) => { if (x.type === "local-candidate" || x.type === "remote-candidate") cands[x.id] = x; });
      st.forEach((x) => {
        if (x.type === "inbound-rtp" && x.kind === "video") out.inV.push({ fd: x.framesDecoded || 0, fr: x.freezeCount || 0, frd: x.totalFreezesDuration || 0, w: x.frameWidth || 0, h: x.frameHeight || 0, pl: x.packetsLost || 0, pr: x.packetsReceived || 0, j: x.jitter || 0 });
        if (x.type === "inbound-rtp" && x.kind === "audio") out.inA.push({ con: x.concealedSamples || 0, tot: x.totalSamplesReceived || 0, pl: x.packetsLost || 0, pr: x.packetsReceived || 0 });
        if (x.type === "outbound-rtp" && x.kind === "video") out.outV.push({ w: x.frameWidth || 0, h: x.frameHeight || 0, lim: x.qualityLimitationReason || "none", fs: x.framesSent || 0 });
        if (x.type === "candidate-pair" && x.state === "succeeded" && x.nominated) {
          const l = cands[x.localCandidateId] || {};
          out.par = { rtt: x.currentRoundTripTime, tipo: l.candidateType, proto: l.protocol, relay: l.relayProtocol || null };
        }
      });
    }
    return out;
  }).catch(() => null);
  if (!s) continue;
  s.t = Date.now() - t0;
  if (!primerVideo && s.inV.some((v) => v.fd > 0)) primerVideo = s.t;
  muestras.push(s);
  n++;
  if (n === 6) await page.screenshot({ path: SALIDA.replace(".json", "_dentro.png") }).catch(() => {});
}
await page.screenshot({ path: SALIDA.replace(".json", "_final.png") }).catch(() => {});
const estados = await page.evaluate(() => window.__estados).catch(() => []);
await browser.close();

// Resumen de la persona.
const ult = muestras[muestras.length - 1] || { inV: [], inA: [], outV: [] };
const sum = (arr, k) => arr.reduce((a, x) => a + (x[k] || 0), 0);
const perdV = sum(ult.inV, "pl") / Math.max(1, sum(ult.inV, "pl") + sum(ult.inV, "pr"));
const audioCort = sum(ult.inA, "con") / Math.max(1, sum(ult.inA, "tot"));
const rtts = muestras.map((m) => m.par && m.par.rtt).filter((x) => x != null).sort((a, b) => a - b);
const res = ult.inV.filter((v) => v.w).map((v) => v.h);
const lim = {};
for (const m of muestras) for (const o of m.outV) lim[o.lim] = (lim[o.lim] || 0) + 1;
const caidas = estados.filter(([, e]) => e === "disconnected" || e === "failed").length;
const volvio = estados.length ? ["connected"].includes(estados[estados.length - 1][1]) || (ult.estado || []).includes("connected") : false;
fs.writeFileSync(SALIDA, JSON.stringify({
  persona: N, cond: E.COND, ciudad: E.REGION, escenario: E.ESCENARIO,
  ve_al_otro_ms: primerVideo,
  videos_recibidos: ult.inV.filter((v) => v.fd > 0).length,
  congelamientos: sum(ult.inV, "fr"), congelado_s: +sum(ult.inV, "frd").toFixed(1),
  resolucion_recibida_mediana: res.length ? res.sort((a, b) => a - b)[Math.floor(res.length / 2)] : null,
  perdida_video_pct: +(perdV * 100).toFixed(2),
  audio_cortado_pct: +(audioCort * 100).toFixed(2),
  rtt_p50_ms: rtts.length ? Math.round(rtts[Math.floor(rtts.length / 2)] * 1000) : null,
  rtt_p95_ms: rtts.length ? Math.round(rtts[Math.floor(rtts.length * 0.95)] * 1000) : null,
  camino: ult.par ? `${ult.par.tipo}/${ult.par.proto}${ult.par.relay ? "/" + ult.par.relay : ""}` : null,
  limita_calidad: lim,
  caidas, volvio, prendio,
  consola: consola.slice(-15),
  muestras: muestras.length,
}, null, 1));
console.log("ok", N, E.COND);
