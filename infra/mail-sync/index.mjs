// mail-sync — el ÚNICO proceso que habla IMAP con el proveedor de correo.
//
// POR QUÉ EXISTE: leer el correo "en vivo" (una sesión IMAP por clic desde
// las edge functions) mostró su techo el 21/08/2026: el proveedor raciona
// conexiones concurrentes y castiga el comportamiento acumulado — con UN
// usuario intensivo la cuenta quedó colgada varias veces en un día. Este
// worker invierte el flujo: mantiene UNA conexión tranquila por casilla
// (como un Thunderbird abierto, el patrón que el proveedor espera), baja lo
// nuevo y lo deja saneado en Postgres (mail_messages). La interfaz lee de la
// base — instantánea, para 60 personas igual que para 5 — y se entera de lo
// nuevo por Supabase Realtime.
//
// TIEMPO REAL: la conexión queda en IDLE sobre INBOX — el servidor EMPUJA
// un aviso cuando llega correo y acá se baja al instante. Las demás
// carpetas se barren cada SWEEP_INTERVAL_MS.
//
// Mismo molde que infra/hubstaff-bridge y blu-bridge: un index.mjs, env
// vars, Dockerfile alpine, endpoint /health para Dokploy.

import http from "node:http";
import { webcrypto } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { sanitizeEmailHtml } from "./sanitize.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAIL_CRED_KEY = process.env.MAIL_CRED_KEY;

// Cada cuánto se barren las carpetas que no son INBOX (INBOX es push).
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 180_000);
// Cada cuánto se relee mail_credentials (altas/bajas de casillas).
const CREDS_REFRESH_MS = Number(process.env.CREDS_REFRESH_MS || 300_000);
// Cuántos mensajes trae por carpeta la PRIMERA vez (después es incremental).
const PER_FOLDER_INIT = Number(process.env.PER_FOLDER_INIT || 50);
// Techo del cuerpo guardado. Un correo de 5 MB de HTML no aporta nada.
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 300_000);
const PORT = Number(process.env.PORT || 4610);

if (!SUPABASE_URL || !SERVICE_KEY || !MAIL_CRED_KEY) {
  console.error("Faltan env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MAIL_CRED_KEY");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Descifrado de credenciales — espejo de supabase/functions/_shared/mail-crypto.ts
// (AES-GCM, clave = SHA-256 de MAIL_CRED_KEY, nonce de 12 bytes).
// ---------------------------------------------------------------------------

let aesKeyPromise = null;
function aesKey() {
  if (!aesKeyPromise) {
    aesKeyPromise = (async () => {
      const material = await webcrypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(MAIL_CRED_KEY),
      );
      return webcrypto.subtle.importKey("raw", material, "AES-GCM", false, ["decrypt"]);
    })();
  }
  return aesKeyPromise;
}

async function unseal(cipherB64, nonceB64) {
  try {
    const key = await aesKey();
    const cipher = Buffer.from(cipherB64, "base64");
    const nonce = Buffer.from(nonceB64, "base64");
    const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch {
    // Clave equivocada o dato corrupto: indistinguibles a propósito.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sincronización de una cuenta
// ---------------------------------------------------------------------------

/** Clave CANÓNICA de una carpeta para la base.
 *
 *  Zoho anuncia el inbox por IMAP con su nombre LOCALIZADO ("Bandeja de
 *  entrada") — descubierto en el primer barrido real: la UI pide "INBOX"
 *  y no encontraba nada. El protocolo garantiza que "INBOX" (reservado,
 *  case-insensitive) siempre abre el buzón de entrada, así que: se ABRE
 *  por el path que anuncie el servidor, se GUARDA siempre como INBOX. */
function claveCanonica(buzon) {
  if (buzon.specialUse === "\\Inbox" || /^inbox$/i.test(buzon.path)) return "INBOX";
  return buzon.path;
}

class CuentaSync {
  constructor(cred) {
    this.cred = cred; // { user_id, email_address, imap_host, imap_port, secret_cipher, secret_nonce }
    this.client = null;
    this.estado = "arrancando";
    this.ultimoBarrido = null;
    this.ultimoError = null;
    this.detenida = false;
    this.reintento = 0;
    this.inboxPendiente = false;
  }

  log(...args) {
    console.log(`[${this.cred.email_address}]`, ...args);
  }

  async run() {
    while (!this.detenida) {
      try {
        await this.ciclo();
        this.reintento = 0;
      } catch (e) {
        this.estado = "error";
        this.ultimoError = e?.message ?? String(e);
        this.log("ciclo falló:", this.ultimoError);
        await this.marcarError(this.ultimoError);
      }
      if (this.detenida) break;
      // Backoff: 10s, 20s, 40s... hasta 5 min. Una cuenta rota no puede
      // ametrallar logins — eso es exactamente lo que el proveedor castiga.
      const espera = Math.min(10_000 * 2 ** this.reintento, 300_000);
      this.reintento++;
      await dormir(espera);
    }
  }

  async ciclo() {
    const password = await unseal(this.cred.secret_cipher, this.cred.secret_nonce);
    if (!password) throw new Error("no se pudo descifrar la credencial");

    this.estado = "conectando";
    this.client = new ImapFlow({
      host: this.cred.imap_host,
      port: this.cred.imap_port,
      secure: true,
      auth: { user: this.cred.email_address, pass: password },
      logger: false,
      // El proveedor corta conexiones muy quietas; imapflow renueva el
      // IDLE solo, pero un tope de socket evita zombies.
      socketTimeout: 5 * 60_000,
    });

    this.client.on("error", (e) => {
      this.ultimoError = e?.message ?? String(e);
    });
    // El servidor avisa que llegó correo al buzón seleccionado (INBOX).
    this.client.on("exists", () => {
      this.inboxPendiente = true;
    });

    await this.client.connect();
    this.estado = "conectada";
    this.log("conectada");

    try {
      // Ciclo de vida: barrer todo → quedarse en IDLE sobre INBOX hasta que
      // haya novedades o toque el próximo barrido → repetir.
      let proximoBarrido = 0;
      while (!this.detenida && this.client.usable) {
        if (Date.now() >= proximoBarrido) {
          await this.barrerTodo();
          proximoBarrido = Date.now() + SWEEP_INTERVAL_MS;
        }

        await this.client.mailboxOpen("INBOX");
        this.inboxPendiente = false;
        this.estado = "idle";

        // idle() se resuelve cuando el servidor manda algo; el reloj lo
        // corta para el barrido periódico de las otras carpetas.
        const restante = Math.max(proximoBarrido - Date.now(), 1_000);
        await Promise.race([this.client.idle(), dormir(restante)]);

        if (this.inboxPendiente) {
          this.log("push: correo nuevo en INBOX");
          await this.sincronizarCarpeta("INBOX");
          this.inboxPendiente = false;
        }
      }
    } finally {
      try {
        await this.client.logout();
      } catch {
        /* ya cortada */
      }
      this.client = null;
    }
  }

  async barrerTodo() {
    this.estado = "barriendo";
    const buzones = await this.client.list();
    for (const b of buzones) {
      if (this.detenida) return;
      if (b.flags?.has("\\Noselect")) continue;
      await this.sincronizarCarpeta(b.path, claveCanonica(b));
    }
    this.ultimoBarrido = new Date().toISOString();
    this.estado = "idle";
  }

  async sincronizarCarpeta(path, clave = path) {
    const lock = await this.client.getMailboxLock(path);
    try {
      const mb = this.client.mailbox;
      const uidValidity = Number(mb.uidValidity ?? 0);
      const uidNext = Number(mb.uidNext ?? 1);
      const exists = mb.exists ?? 0;

      const { data: st } = await db
        .from("mail_sync_state")
        .select("uidvalidity, last_uid")
        .eq("user_id", this.cred.user_id)
        .eq("folder", clave)
        .maybeSingle();

      let desdeUid = 0;
      if (st && Number(st.uidvalidity) === uidValidity) {
        desdeUid = Number(st.last_uid);
      } else if (st) {
        // La carpeta "renació" (uidvalidity cambió): los UID viejos ya no
        // significan nada. Se tira lo cacheado de esa generación y se
        // resincroniza — es el contrato de IMAP, no una rareza nuestra.
        this.log(`uidvalidity cambió en ${path}: resincronizando`);
        await db
          .from("mail_messages")
          .delete()
          .eq("user_id", this.cred.user_id)
          .eq("folder", clave);
      }

      let maxUid = desdeUid;

      if (exists > 0 && uidNext - 1 > desdeUid) {
        // Primera vez: solo los últimos N (nadie necesita el 2019 entero
        // de una). Después: incremental por UID, exactamente lo nuevo.
        const rango = desdeUid === 0
          ? `${Math.max(1, exists - PER_FOLDER_INIT + 1)}:*`
          : `${desdeUid + 1}:*`;
        const porUid = desdeUid !== 0;

        for await (const msg of this.client.fetch(
          rango,
          { uid: true, flags: true, source: true },
          porUid ? { uid: true } : undefined,
        )) {
          const uid = Number(msg.uid);
          if (uid <= desdeUid) continue; // '*' puede devolver el último igual
          await this.guardarMensaje(clave, uidValidity, uid, msg);
          if (uid > maxUid) maxUid = uid;
        }
      }

      // Banderas de lo reciente: si alguien leyó desde otro lado (o el
      // propio mark_seen), el punto azul de la caché tiene que apagarse.
      await this.refrescarBanderas(clave, uidValidity, exists);

      await db.from("mail_sync_state").upsert({
        user_id: this.cred.user_id,
        folder: clave,
        uidvalidity: uidValidity,
        last_uid: maxUid,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,folder" });

      const status = await this.client.status(path, { messages: true, unseen: true });
      await db.from("mail_folders").upsert({
        user_id: this.cred.user_id,
        folder: clave,
        total: status.messages ?? 0,
        unread: status.unseen ?? 0,
        synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,folder" });
    } finally {
      lock.release();
    }
  }

  async refrescarBanderas(clave, uidValidity, exists) {
    if (exists === 0) return;
    const desde = Math.max(1, exists - PER_FOLDER_INIT + 1);
    const vistos = [];
    const noVistos = [];
    for await (const msg of this.client.fetch(`${desde}:*`, { uid: true, flags: true })) {
      const uid = Number(msg.uid);
      (msg.flags?.has("\\Seen") ? vistos : noVistos).push(uid);
    }
    if (vistos.length) {
      await db.from("mail_messages")
        .update({ unread: false })
        .eq("user_id", this.cred.user_id)
        .eq("folder", clave)
        .eq("uidvalidity", uidValidity)
        .in("uid", vistos)
        .eq("unread", true);
    }
    if (noVistos.length) {
      await db.from("mail_messages")
        .update({ unread: true })
        .eq("user_id", this.cred.user_id)
        .eq("folder", clave)
        .eq("uidvalidity", uidValidity)
        .in("uid", noVistos)
        .eq("unread", false);
    }
  }

  async guardarMensaje(clave, uidValidity, uid, msg) {
    let parsed;
    try {
      parsed = await simpleParser(msg.source, { skipImageLinks: true });
    } catch (e) {
      this.log(`no se pudo parsear uid ${uid} de ${clave}:`, e?.message);
      return;
    }

    const crudoHtml = typeof parsed.html === "string" ? parsed.html : null;
    const texto = parsed.text ?? "";
    const clean = crudoHtml ? sanitizeEmailHtml(crudoHtml) : null;

    let html = clean?.html ?? null;
    let truncated = false;
    if (html && Buffer.byteLength(html, "utf8") > MAX_BODY_BYTES) {
      html = html.slice(0, MAX_BODY_BYTES);
      truncated = true;
    }

    const snippet = texto.replace(/\s+/g, " ").trim().slice(0, 160);

    const attachments = (parsed.attachments ?? []).map((a) => ({
      filename: a.filename ?? "adjunto",
      contentType: a.contentType ?? "application/octet-stream",
      sizeBytes: a.size ?? 0,
      contentId: a.cid ?? null,
    }));

    const { error } = await db.from("mail_messages").upsert({
      user_id: this.cred.user_id,
      folder: clave,
      uid,
      uidvalidity: uidValidity,
      message_id: parsed.messageId ?? null,
      from_addr: parsed.from?.text ?? "",
      to_addr: parsed.to?.text ?? "",
      cc_addr: parsed.cc?.text ?? "",
      subject: parsed.subject || "(sin asunto)",
      date: parsed.date ? parsed.date.toISOString() : new Date().toISOString(),
      snippet,
      html,
      text_body: texto.slice(0, MAX_BODY_BYTES),
      remote_images: clean?.remoteImages ?? 0,
      attachments,
      truncated,
      unread: !msg.flags?.has("\\Seen"),
      synced_at: new Date().toISOString(),
    }, { onConflict: "user_id,folder,uidvalidity,uid" });

    if (error) this.log(`upsert uid ${uid} falló:`, error.message);
  }

  async marcarError(msg) {
    await db.from("mail_credentials")
      .update({ last_error: `sync: ${msg}`.slice(0, 300) })
      .eq("user_id", this.cred.user_id)
      .eq("email_address", this.cred.email_address);
  }

  async detener() {
    this.detenida = true;
    try {
      await this.client?.logout();
    } catch {
      /* nada */
    }
  }
}

// ---------------------------------------------------------------------------
// Orquestación: una CuentaSync por credencial activa
// ---------------------------------------------------------------------------

const cuentas = new Map(); // email -> CuentaSync

async function refrescarCuentas() {
  const { data, error } = await db
    .from("mail_credentials")
    .select("user_id, email_address, imap_host, imap_port, secret_cipher, secret_nonce")
    .is("revoked_at", null);
  if (error) {
    console.error("no se pudieron leer credenciales:", error.message);
    return;
  }

  const vivas = new Set();
  let i = 0;
  for (const cred of data ?? []) {
    vivas.add(cred.email_address);
    if (!cuentas.has(cred.email_address)) {
      const cuenta = new CuentaSync(cred);
      cuentas.set(cred.email_address, cuenta);
      // ESCALONADO: los logins simultáneos son lo que el proveedor castiga.
      const retraso = i * 3_000;
      i++;
      setTimeout(() => void cuenta.run(), retraso);
      console.log(`cuenta nueva: ${cred.email_address} (arranca en ${retraso / 1000}s)`);
    }
  }

  // Casillas revocadas: se detiene su sync (las filas cacheadas quedan;
  // borrar datos es decisión humana, no de un worker).
  for (const [email, cuenta] of cuentas) {
    if (!vivas.has(email)) {
      console.log(`credencial revocada, deteniendo: ${email}`);
      void cuenta.detener();
      cuentas.delete(email);
    }
  }
}

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Un rechazo suelto (p. ej. el perdedor de un Promise.race) no puede
// voltear el proceso entero que sincroniza 60 casillas.
process.on("unhandledRejection", (e) => {
  console.error("unhandledRejection:", e?.message ?? e);
});

// /health para Dokploy y para humanos con curl.
http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    const detalle = [...cuentas.values()].map((c) => ({
      email: c.cred.email_address,
      estado: c.estado,
      ultimo_barrido: c.ultimoBarrido,
      ultimo_error: c.ultimoError,
    }));
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, cuentas: detalle.length, detalle }, null, 2));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, () => console.log(`mail-sync escuchando en :${PORT}`));

await refrescarCuentas();
setInterval(() => void refrescarCuentas(), CREDS_REFRESH_MS);
