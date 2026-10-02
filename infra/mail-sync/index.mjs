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
// carpetas se barren cada SWEEP_FULL_MS; INBOX se revisa cada SWEEP_INBOX_MS.
//
// Mismo molde que infra/hubstaff-bridge y blu-bridge: un index.mjs, env
// vars, Dockerfile alpine, endpoint /health para Dokploy.

import http from "node:http";
import { webcrypto } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { sanitizeEmailHtml } from "./sanitize.mjs";
import { esAvisoDelProveedor } from "./notices.mjs";
import { decidirSiAbrir } from "./barrido.mjs";
import { ancestrosDe, decidirHerencia } from "./hilos.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAIL_CRED_KEY = process.env.MAIL_CRED_KEY;

// Cada cuánto se barren las carpetas que no son INBOX (INBOX es push).
// Dos cadencias de barrido (el push de Zoho no empuja — ver memoria
// zoho_imap_rate_limits: probado 23/08). INBOX es donde llega el correo, así
// que se revisa seguido; las demás carpetas (Enviados, etc.) cambian poco y se
// barren espaciado — menos comandos contra Zoho por el mismo resultado.
// SWEEP_INTERVAL_MS se mantiene como piso de compatibilidad para INBOX.
const SWEEP_INBOX_MS = Number(process.env.SWEEP_INBOX_MS || process.env.SWEEP_INTERVAL_MS || 60_000);
const SWEEP_FULL_MS = Number(process.env.SWEEP_FULL_MS || 300_000);
// Carpetas "calientes": se revisan con la cadencia de INBOX (SWEEP_INBOX_MS) en
// vez de esperar el barrido completo. Claves canónicas (INBOX siempre se guarda
// como INBOX).
//
// ⚠️ Acá va TODA carpeta a la que Zoho mande correo que urge, no solo el INBOX.
// Sus reglas sacan del INBOX justamente lo más sensible al tiempo: los códigos
// de verificación de GitHub y los resets de contraseña caen en "Notification", y
// los códigos de confirmación de Facebook en "Newsletter" (sí, Zoho los clasifica
// como boletín). Medido el 16/09/2026 con HOT_FOLDERS=INBOX solo: el INBOX
// entregaba en 0-1 min y esas dos carpetas en 5, 7, 16 y 20 min, las cuatro
// entrando en el MISMO segundo — el barrido completo de 30 min. Un código de dos
// factores que llega 20 minutos tarde ya venció.
//
// Que estén acá NO cuesta un SELECT+FETCH por minuto: `revisarCarpeta` pregunta
// primero con un STATUS (un comando liviano) y solo abre si algo cambió. Lo que
// el proveedor castigaba —58 casillas × TODAS sus carpetas abiertas cada 5 min—
// no es esto. El recorte a "INBOX" del 10/09 se decidió el mismo día en que entró
// esa compuerta (#1803), o sea con el modelo de costo viejo.
const HOT_FOLDERS = (process.env.HOT_FOLDERS || "INBOX,Notification,Newsletter")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Espaciado entre logins al arrancar. Los logins en ráfaga son lo que el
// proveedor castiga (tarpit); 3s a 35 casillas = ~20 logins/min en cada deploy
// (medido 02/09: 22/35 con "Connection not available"). 6s lo baja a la mitad.
const STARTUP_STAGGER_MS = Number(process.env.STARTUP_STAGGER_MS || 6_000);
// Cada cuánto se relee mail_credentials (altas/bajas de casillas).
const CREDS_REFRESH_MS = Number(process.env.CREDS_REFRESH_MS || 300_000);
// Piso de reconciliación por carpeta. El barrido normal solo ESCRIBE en
// Postgres cuando algo cambió de verdad; este piso es la red de seguridad para
// el caso raro en que el estado local y el del proveedor se desalineen (por
// ejemplo si el mark_seen del front, que es fire-and-forget, no llegó a IMAP).
// Antes esta reconciliación corría en CADA barrido: 5,6 peticiones por carpeta
// aunque no hubiera pasado nada, y el 99,92% de los barridos no trae correo
// (medido 04/09 sobre edge_logs: 163 correos guardados, 1.213.688 peticiones).
const RECONCILIAR_MS = Number(process.env.RECONCILIAR_MS || 900_000);
// Latido: como mucho cada tanto el worker escribe mail_credentials.last_sync_at
// con la hora en que terminó de revisar la casilla. mail_folders.synced_at ya
// no sirve para saber si está vivo: solo se escribe cuando algo cambió, y con
// el STATUS de abajo casi nunca cambia (10/09: leímos "22 casillas sin barrer
// hace más de 10 min" donde había casillas quietas).
const LATIDO_MS = Number(process.env.LATIDO_MS || 300_000);
// Cuántos mensajes trae por carpeta la PRIMERA vez (después es incremental).
const PER_FOLDER_INIT = Number(process.env.PER_FOLDER_INIT || 50);
// Una respuesta a una charla etiquetada hereda sus etiquetas (y se archiva si
// la charla ya estaba archivada). Ver hilos.mjs. HEREDAR_DEL_HILO=0 lo apaga.
const HEREDAR_DEL_HILO = process.env.HEREDAR_DEL_HILO !== "0";
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
    // Corta la espera del IDLE en cuanto el servidor avisa correo nuevo
    // (lo setea el handler "exists"; lo consume el ciclo). Ver más abajo.
    this.despertar = null;
    // clave de carpeta → { uidvalidity, last_uid }. Se llena de una sola vez
    // por barrido (cargarEstado) en vez de un SELECT por carpeta.
    this.estadoCarpetas = new Map();
    // clave → huella de las banderas del último barrido, para no reescribir
    // en Postgres cuando nadie leyó ni llegó nada.
    this.firmaBanderas = new Map();
    // clave → cuándo se reconcilió por última vez (piso RECONCILIAR_MS).
    this.ultimaReconciliacion = new Map();
    // clave → huella del último STATUS (uidvalidity|uidnext|mensajes|no leídos).
    // Si la huella no cambió y no toca reconciliar, la carpeta no se abre.
    this.huellaCarpeta = new Map();
    this.abiertas = 0; // carpetas abiertas (SELECT + FETCH) desde el arranque
    this.saltadas = 0; // carpetas saltadas gracias al STATUS
    this.ultimaRevision = null; // fin del último barrido, caliente o completo
    this.ultimoLatido = 0;
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
    // Además de marcar la bandera, DESPERTAMOS la espera del ciclo: antes
    // solo se ponía inboxPendiente=true y el correo no se bajaba hasta que
    // vencía el timer del barrido (SWEEP_INTERVAL_MS) — por eso todo llegaba
    // con el retraso del barrido en vez de al instante. Cortar acá hace que
    // el push sea de verdad inmediato.
    this.client.on("exists", () => {
      this.inboxPendiente = true;
      this.despertar?.();
    });
    // Alguien leyó o des-leyó en INBOX desde otro cliente (o el mark_seen de
    // Maven): el servidor lo cuenta con un FETCH suelto durante el IDLE. Se
    // trata igual que el correo nuevo: una vuelta de INBOX y el punto azul se
    // corrige al instante en vez de esperar al barrido. Las respuestas a
    // NUESTROS fetch no pasan por acá (imapflow las entrega al comando en curso).
    this.client.on("flags", () => {
      this.inboxPendiente = true;
      this.despertar?.();
    });

    await this.client.connect();
    this.estado = "conectada";
    this.log("conectada");
    // La conexión entró: si había un last_error (casi siempre de conexión, y
    // pegajoso hasta ahora), se limpia. Sin esto no se distingue un error de
    // hoy de uno de hace semanas y la salud del worker es ilegible.
    await this.limpiarError();

    try {
      // Ciclo de vida con DOS relojes:
      //  · barrido COMPLETO (todas las carpetas) cada SWEEP_FULL_MS;
      //  · revisión de INBOX sola cada SWEEP_INBOX_MS (mucho más liviano:
      //    un SELECT/FETCH de una carpeta en vez de abrir todas).
      // Entre medio, IDLE en INBOX + despertar-en-exists por si el proveedor
      // algún día empuja. El barrido completo ya incluye INBOX, así que tras
      // él se reprograma también el reloj de INBOX.
      let proximoFull = 0;
      let proximoInbox = 0;
      while (!this.detenida && this.client.usable) {
        const ahora = Date.now();
        if (ahora >= proximoFull) {
          await this.barrerTodo();
          proximoFull = Date.now() + SWEEP_FULL_MS;
          proximoInbox = Date.now() + SWEEP_INBOX_MS;
        } else if (ahora >= proximoInbox) {
          await this.barrerCalientes();
          proximoInbox = Date.now() + SWEEP_INBOX_MS;
        }

        await this.client.mailboxOpen("INBOX");
        this.inboxPendiente = false;
        this.estado = "idle";

        // Tres formas de salir de la espera:
        //  · `porEvento`: el handler "exists" la corta apenas llega correo
        //    (push inmediato — es lo que faltaba);
        //  · `client.idle()`: mantiene la conexión en IDLE para que Zoho
        //    empuje ese EXISTS (algunos servidores además resuelven acá);
        //  · `dormir(restante)`: red de seguridad hasta el próximo barrido.
        const restante = Math.max(Math.min(proximoInbox, proximoFull) - Date.now(), 1_000);
        const porEvento = new Promise((res) => { this.despertar = res; });
        try {
          await Promise.race([
            this.client.idle().catch(() => {}),
            porEvento,
            dormir(restante),
          ]);
        } finally {
          this.despertar = null;
        }

        if (this.inboxPendiente) {
          this.log("push: novedad en INBOX");
          await this.sincronizarCarpeta("INBOX");
          this.inboxPendiente = false;
          // Se abrió sin pasar por el STATUS: la huella guardada quedó vieja.
          this.huellaCarpeta.delete("INBOX");
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

  /** UNA lectura de mail_sync_state para TODAS las carpetas de la casilla.
   *  Antes cada carpeta hacía su propio SELECT (215.342 peticiones en 24 h)
   *  para leer una fila que este worker es el único que escribe. */
  async cargarEstado() {
    const { data } = await db
      .from("mail_sync_state")
      .select("folder, uidvalidity, last_uid")
      .eq("user_id", this.cred.user_id);
    this.estadoCarpetas = new Map(
      (data ?? []).map((r) => [
        r.folder,
        { uidvalidity: Number(r.uidvalidity), last_uid: Number(r.last_uid) },
      ]),
    );
  }

  async barrerTodo() {
    this.estado = "barriendo";
    await this.cargarEstado();
    const buzones = await this.client.list();
    // Se recuerda clave→path de las carpetas seleccionables para que el barrido
    // caliente abra por el path real del servidor (INBOX puede venir localizado).
    const carpetas = new Map();
    for (const b of buzones) {
      if (this.detenida) return;
      if (b.flags?.has("\\Noselect")) continue;
      const clave = claveCanonica(b);
      carpetas.set(clave, b.path);
      await this.revisarCarpeta(b.path, clave);
    }
    this.carpetas = carpetas;
    this.ultimoBarrido = new Date().toISOString();
    await this.latir(this.ultimoBarrido);
    this.estado = "idle";
  }

  /** Barrido "caliente": solo HOT_FOLDERS (INBOX + Notification + Newsletter),
   *  con la cadencia de SWEEP_INBOX_MS. Solo las que existen en esta casilla —
   *  pedir una carpeta inexistente tiraría todo el ciclo a backoff. */
  async barrerCalientes() {
    if (!this.carpetas) return; // aún no corrió el barrido completo
    await this.cargarEstado();
    for (const clave of HOT_FOLDERS) {
      if (this.detenida) return;
      const path = this.carpetas.get(clave);
      if (!path) continue;
      await this.revisarCarpeta(path, clave);
    }
    await this.latir(new Date().toISOString());
  }

  /** Antes de ABRIR una carpeta (SELECT + FETCH de las banderas de los últimos
   *  50: lo caro, y lo que Zoho castiga cuando son 58 casillas × N carpetas
   *  cada minuto) se le pregunta al servidor con un STATUS, un solo comando
   *  liviano. Si nada cambió desde la última vez y no toca reconciliar, la
   *  carpeta se salta. La decisión en sí vive en barrido.mjs (probada). */
  async revisarCarpeta(path, clave = path) {
    let status = null;
    try {
      status = await this.client.status(path, { messages: true, uidNext: true, uidValidity: true, unseen: true });
    } catch (e) {
      this.log(`STATUS falló en ${path}; se abre igual:`, e?.message);
    }
    const decision = decidirSiAbrir({
      status: status || null,
      huellaPrevia: this.huellaCarpeta.get(clave) ?? null,
      ultimaReconciliacion: this.ultimaReconciliacion.get(clave) ?? 0,
      ahora: Date.now(),
      reconciliarMs: RECONCILIAR_MS,
    });
    if (!decision.abrir) {
      this.saltadas++;
      return;
    }
    await this.sincronizarCarpeta(path, clave);
    this.abiertas++;
    // La huella es la de ANTES de abrir: si entró correo entre el STATUS y el
    // SELECT, la próxima vuelta ve la diferencia y vuelve a abrir. Nunca al revés.
    if (decision.huella) this.huellaCarpeta.set(clave, decision.huella);
    else this.huellaCarpeta.delete(clave);
  }

  /** Latido: como mucho cada LATIDO_MS deja en mail_credentials.last_sync_at
   *  la hora en que terminó de revisar la casilla. Responde "¿el worker está
   *  vivo para esta casilla?" con un SELECT, sin entrar al contenedor. */
  async latir(iso) {
    this.ultimaRevision = iso;
    if (Date.now() - this.ultimoLatido < LATIDO_MS) return;
    this.ultimoLatido = Date.now();
    const { error } = await db.from("mail_credentials")
      .update({ last_sync_at: iso })
      .eq("user_id", this.cred.user_id)
      .eq("email_address", this.cred.email_address);
    if (error) this.log("no se pudo escribir el latido:", error.message);
  }

  async sincronizarCarpeta(path, clave = path) {
    const lock = await this.client.getMailboxLock(path);
    try {
      const mb = this.client.mailbox;
      const uidValidity = Number(mb.uidValidity ?? 0);
      const uidNext = Number(mb.uidNext ?? 1);
      const exists = mb.exists ?? 0;

      const st = this.estadoCarpetas?.get(clave) ?? null;

      let desdeUid = 0;
      let renacio = false;
      if (st && Number(st.uidvalidity) === uidValidity) {
        desdeUid = Number(st.last_uid);
      } else if (st) {
        renacio = true;
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
      let nuevos = 0;
      // Lo nuevo de Recibidos que responde a algo: candidatos a heredar las
      // etiquetas de su conversación (ver heredarDelHilo).
      const respuestas = [];

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
          const guardado = await this.guardarMensaje(clave, uidValidity, uid, msg);
          // Solo lo incremental: en la primera carga de una casilla llegan los
          // últimos 50 de golpe, y archivar en masa lo viejo no es heredar.
          if (guardado && porUid && clave === "INBOX" && HEREDAR_DEL_HILO) respuestas.push({ uid, ...guardado });
          nuevos++;
          if (uid > maxUid) maxUid = uid;
        }
      }
      if (respuestas.length) {
        // Nunca puede tirar el barrido: lo peor que pasa si falla es lo de
        // antes (la respuesta queda en Recibidos sin etiqueta).
        try { await this.heredarDelHilo(respuestas, uidValidity); }
        catch (e) { this.log("heredar del hilo falló:", e?.message); }
      }

      // Banderas de lo reciente: si alguien leyó desde otro lado (o el
      // propio mark_seen), el punto azul de la caché tiene que apagarse.
      const tocaReconciliar =
        Date.now() - (this.ultimaReconciliacion.get(clave) ?? 0) >= RECONCILIAR_MS;
      const cambiaronBanderas = await this.refrescarBanderas(
        clave,
        uidValidity,
        exists,
        tocaReconciliar,
      );
      const huboCambio = nuevos > 0 || cambiaronBanderas || renacio;

      // Nada nuevo, nada que reconciliar → no hay nada que escribir. Este
      // return es el que ahorra el grueso del tráfico: el conteo, el upsert de
      // mail_folders y el de mail_sync_state corrían en CADA barrido de CADA
      // carpeta aunque el buzón estuviera idéntico.
      if (!huboCambio && !tocaReconciliar) return;

      if (maxUid !== desdeUid || renacio) {
        await db.from("mail_sync_state").upsert({
          user_id: this.cred.user_id,
          folder: clave,
          uidvalidity: uidValidity,
          last_uid: maxUid,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,folder" });
        // La copia en memoria queda al día para el próximo barrido y para el
        // camino de push, que sincroniza INBOX sin releer el estado.
        this.estadoCarpetas.set(clave, { uidvalidity: uidValidity, last_uid: maxUid });
      }

      // Los conteos salen de la CACHÉ, no del STATUS del servidor: el
      // servidor cuenta también los avisos ocultos y el badge mentiría.
      const { count: total } = await db.from("mail_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", this.cred.user_id).eq("folder", clave);
      const { count: unread } = await db.from("mail_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", this.cred.user_id).eq("folder", clave).eq("unread", true);
      await db.from("mail_folders").upsert({
        user_id: this.cred.user_id,
        folder: clave,
        total: total ?? 0,
        unread: unread ?? 0,
        synced_at: new Date().toISOString(),
      }, { onConflict: "user_id,folder" });
      this.ultimaReconciliacion.set(clave, Date.now());
    } finally {
      lock.release();
    }
  }

  /** Devuelve si escribió algo. La LECTURA por IMAP se hace siempre (es la
   *  única forma de enterarse de que alguien leyó desde otro cliente); lo que
   *  se evita es escribir en Postgres cuando las banderas quedaron idénticas a
   *  las del barrido anterior. `forzar` salta esa comparación: es el piso de
   *  reconciliación, por si una escritura anterior se perdió. */
  async refrescarBanderas(clave, uidValidity, exists, forzar = false) {
    if (exists === 0) return false;
    const desde = Math.max(1, exists - PER_FOLDER_INIT + 1);
    const vistos = [];
    const noVistos = [];
    for await (const msg of this.client.fetch(`${desde}:*`, { uid: true, flags: true })) {
      const uid = Number(msg.uid);
      (msg.flags?.has("\\Seen") ? vistos : noVistos).push(uid);
    }
    const firma = `${uidValidity}|${vistos.join(",")}|${noVistos.join(",")}`;
    if (!forzar && this.firmaBanderas.get(clave) === firma) return false;
    this.firmaBanderas.set(clave, firma);
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
    return true;
  }

  async guardarMensaje(clave, uidValidity, uid, msg) {
    let parsed;
    try {
      parsed = await simpleParser(msg.source, { skipImageLinks: true });
    } catch (e) {
      this.log(`no se pudo parsear uid ${uid} de ${clave}:`, e?.message);
      return;
    }

    // Los avisos del proveedor no llegan ni a la caché: el empleado solo
    // conoce Maven. Los REBOTES (mailer-daemon) sí pasan — ocultarlos haría
    // creer que un correo llegó cuando no.
    if (esAvisoDelProveedor(parsed.from?.text ?? "")) return;

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
      // Las dos cabeceras que encadenan la conversación (RFC 5322). Sin ellas
      // agrupar en hilos solo se puede adivinar por el asunto, y adivinar une
      // de más. `references` en mailparser viene como string o como array
      // según el correo: se normaliza acá para que la base vea siempre lo
      // mismo.
      in_reply_to: parsed.inReplyTo ?? null,
      refs: Array.isArray(parsed.references)
        ? parsed.references
        : parsed.references
          ? [parsed.references]
          : null,
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

    if (error) {
      this.log(`upsert uid ${uid} falló:`, error.message);
      return null;
    }
    return {
      messageId: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      refs: parsed.references ?? null,
      date: parsed.date ? parsed.date.toISOString() : null,
    };
  }

  /** Las respuestas nuevas de Recibidos heredan las etiquetas de su charla, y
   *  si la charla ya estaba archivada se archivan con ella (hilos.mjs decide).
   *  Corre DENTRO del lock de Recibidos, con la carpeta seleccionada: el MOVE
   *  sale de acá mismo. La fila de la caché se TRASLADA (no se borra), igual
   *  que en el «Mover a» de la edge: si no, la etiqueta apuntaría a una fila
   *  que no existe hasta el próximo barrido de Archivados (30 min). */
  async heredarDelHilo(respuestas, uidValidityInbox) {
    const yo = this.cred.user_id;
    const porArchivar = [];
    for (const r of respuestas) {
      const ancestros = ancestrosDe(r);
      if (!r.messageId || !ancestros.length) continue;
      const { data: etis, error } = await db.from("mail_message_labels")
        .select("message_id, label_id").eq("user_id", yo).in("message_id", ancestros);
      if (error || !etis?.length) continue;
      const { count: propias } = await db.from("mail_message_labels")
        .select("label_id", { count: "exact", head: true }).eq("user_id", yo).eq("message_id", r.messageId);
      const etiquetados = [...new Set(etis.map((e) => e.message_id))];
      const { count: enRecibidos } = await db.from("mail_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", yo).eq("folder", "INBOX").in("message_id", etiquetados);
      const d = decidirHerencia({
        etiquetasDelHilo: etis.map((e) => e.label_id),
        yaTieneEtiquetas: (propias ?? 0) > 0,
        etiquetadosEnRecibidos: (enRecibidos ?? 0) > 0,
        fecha: r.date,
        ahora: Date.now(),
      });
      if (!d.etiquetas.length) continue;
      const { error: e2 } = await db.from("mail_message_labels").upsert(
        d.etiquetas.map((label_id) => ({ user_id: yo, message_id: r.messageId, label_id })),
        { onConflict: "user_id,message_id,label_id", ignoreDuplicates: true },
      );
      if (e2) { this.log(`no se pudo heredar la etiqueta de uid ${r.uid}:`, e2.message); continue; }
      this.log(`uid ${r.uid}: heredó ${d.etiquetas.length} etiqueta(s) de su charla${d.archivar ? " y se archiva" : ""}`);
      if (d.archivar) porArchivar.push(r.uid);
    }
    if (!porArchivar.length) return;

    // La carpeta de archivo de Zoho es «Archive» (la misma que usa la edge).
    const destino = this.carpetas?.get("Archive") ?? "Archive";
    const movido = await this.client.messageMove(porArchivar.join(","), destino, { uid: true });
    if (!movido) { this.log("no se pudo archivar lo heredado"); return; }
    const mapa = movido.uidMap instanceof Map ? movido.uidMap : new Map();
    const validez = Number(movido.uidValidity ?? 0);
    for (const viejo of porArchivar) {
      const nuevo = mapa.get(viejo);
      if (nuevo && validez) {
        const { error } = await db.from("mail_messages")
          .update({ folder: "Archive", uidvalidity: validez, uid: Number(nuevo), synced_at: new Date().toISOString() })
          .eq("user_id", yo).eq("folder", "INBOX").eq("uidvalidity", uidValidityInbox).eq("uid", viejo);
        if (!error) continue;
      }
      // Sin el uid nuevo (o si el traslado chocó) la fila sale de Recibidos y
      // el barrido de Archivados la trae.
      await db.from("mail_messages").delete()
        .eq("user_id", yo).eq("folder", "INBOX").eq("uidvalidity", uidValidityInbox).eq("uid", viejo);
    }
  }

  async marcarError(msg) {
    await db.from("mail_credentials")
      .update({ last_error: `sync: ${msg}`.slice(0, 300) })
      .eq("user_id", this.cred.user_id)
      .eq("email_address", this.cred.email_address);
  }

  /** Borra last_error al recuperarse. marcarError lo escribía y nadie lo
   *  limpiaba: quedaba pegajoso y 22/35 casillas "con error" eran historia. */
  async limpiarError() {
    this.ultimoError = null;
    await db.from("mail_credentials")
      .update({ last_error: null })
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
      const retraso = i * STARTUP_STAGGER_MS;
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
      ultima_revision: c.ultimaRevision,
      carpetas_abiertas: c.abiertas,
      carpetas_saltadas: c.saltadas,
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
