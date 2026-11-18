// API pública de Maven — autenticada por API key (no por sesión Maven).
// verify_jwt=false: la auth es la key `mvk_live_...` que mandan en
//   Authorization: Bearer mvk_live_...   (o en el header X-API-Key)
//
// Recursos (Fase 1): datos de la AGENCIA (no data de fans de OF).
//   GET /public-api/creators           scope creators:read
//   GET /public-api/creators/:id        creators:read
//   GET /public-api/contacts            contacts:read   (+ contacts:phone para PII)
//   GET /public-api/contacts/:id        contacts:read
//   GET /public-api/employees           employees:read
//   GET /public-api/sales               sales:read      (ganancias diarias por creadora)
//   GET /public-api/sales/chatters      sales:chatters  (ventas diarias por chatter)
//   GET /public-api/cowork/time         cowork:read     (tiempo en Cowork por empleado y día)
//   GET /public-api/cowork/time/segments cowork:read    (cada tramo del reloj, al detalle)
//   GET /public-api/cowork/breaks       cowork:read     (cada pausa: baño o break, con tope y exceso)
//   GET /public-api/cowork/meets        cowork:read     (cada meet grupal: quién lo invocó, quién estuvo y cuánto)
//   GET /public-api/me                  (sin scope)     (como quién actúa la llave, y su cupo)
//   GET /public-api/messenger/conversations              messenger:read (la bandeja de la persona)
//   GET /public-api/messenger/conversations/:id          messenger:read (una conversación y sus miembros)
//   GET /public-api/messenger/conversations/:id/messages messenger:read (historia, con cursor)
//   GET /public-api/messenger/feed                       messenger:read (lo nuevo en todas, con cursor)
//   POST /public-api/equipo/sync                         equipo:write   (la plataforma de la agencia manda el
//                                                        equipo y sus roles; ver ./equipo-logica.ts y
//                                                        docs/conectar-plataforma.md)
//   GET  /public-api/equipo                              equipo:write   (el equipo como quedó)
//   GET  /public-api/equipo/horas?desde&hasta            equipo:write   (horas y asistencia de Cowork)
//   GET  /public-api/equipo/notas?desde&hasta            equipo:write   (la nota de Argos con su desglose)
//   GET  /public-api/equipo/argos?desde&hasta            equipo:write   (lo que Argos vio en cada turno)
//   POST /public-api/contenido/subidas                   contenido:write (subir un personalizado a la
//   POST /public-api/contenido/subidas/:id/listo                          carpeta de la modelo; ver
//   GET  /public-api/contenido/subidas/:id                                ./contenido.ts)
//
// Escribir en el Messenger (messenger:write, que va siempre con messenger:read):
//   GET    /public-api/messenger/people                                  a quién se le puede escribir
//   POST   /public-api/messenger/conversations                           abrir un directo con su primer mensaje
//   POST   /public-api/messenger/conversations/:id/messages              mandar un mensaje
//   PATCH  /public-api/messenger/conversations/:id/messages/:messageId   editar lo que mandó la misma integración
//   DELETE /public-api/messenger/conversations/:id/messages/:messageId   borrarlo
// Los dos POST exigen Idempotency-Key (72 h). La pared es la BASE (migración
// 20261001200000_api_messenger_escritura.sql): valida la key del claim `mvk` en cada
// escritura, cobra los topes y pone la marca «vino por API». Este archivo nunca nombra
// una tabla del chat ni una RPC de escritura: todo pasa por servirComoUsuario.
//
// LÍMITE: 1.000 pedidos por hora por llave (api_keys.limite_por_hora), en ventana
// fija que se reinicia a la hora en punto, y 60 por minuto (limite_por_minuto) para
// que no se gasten todos de golpe. Pasado cualquiera de los dos, 429 con
// Retry-After. Las respuestas a una llave válida llevan X-RateLimit-Limit /
// -Remaining / -Reset, que son los de la hora.
//
// ACTÚA COMO. Cada llave está atada a una persona real (api_keys.acts_as_user_id,
// fija desde que se crea). Los recursos `como_usuario` se consultan con la sesión de
// esa persona y no con service_role: ver ./como-usuario.ts. Si esa persona ya no está
// activa en Maven, la llave deja de servir.
//
// La key se busca por su hash SHA-256; se chequea que no esté revocada ni vencida,
// que la IP esté permitida (si tiene whitelist) y que tenga el scope del recurso.
//
// ⚠️ AISLAMIENTO ENTRE AGENCIAS. Esta función corre con service_role: SALTA LA RLS.
// La única pared entre agencias es lo que el código filtre. Cada llave pertenece a
// una agencia (`api_keys.tenant_id`, asignada por la base) y cada recurso declara
// cómo se aísla en `./aislamiento.ts`. Un recurso que no sabe de qué
// agencia es cada fila se APAGA solo en cuanto Maven tenga más de una. Antes de
// agregar un endpoint, lee ese archivo: el test va a obligar a hacerlo igual.
//
// IDIOMA. Todo `message` que ve el cliente sale de ./mensajes.ts: en inglés si el
// pedido lo pide con Accept-Language, en español (el de siempre) si no. El código de
// máquina (`error`), el estado, las cabeceras y los datos no cambian nunca.
import { corsFor } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// Local a esta función y no en _shared/: un cambio en _shared/ redespliega TODAS
// las edge functions, y este módulo solo lo usa public-api.
import { AISLAMIENTO_POR_RECURSO, decidir, esComoUsuario } from "./aislamiento.ts";
import { clienteDeLlave, comoUsuarioConfigurado } from "./como-usuario.ts";
import { servirComoUsuario } from "./recursos-como-usuario.ts";
import { servirContenido } from "./contenido.ts";
import { rutaDeContenido } from "./contenido-logica.ts";
import { cabecerasDeCupo, clientIp, CUERPO_MAX_BYTES, fetchSinReintentos, ipAllowed, leerCuerpo } from "./peticion.ts";
import { idiomaDelPedido, msg, varyConIdioma } from "./mensajes.ts";
import { esMetodo, leerCuerpoDeEscritura, leerIdempotencia, METODOS, type ObjetoJson, scopesDeLaRuta } from "./escritura-formato.ts";

// Los plazos de los clientes en una escritura (sin reintentos escondidos: ver
// fetchSinReintentos). El de service_role cubre buscar la key, el cupo y el conteo de
// agencias. El de la persona es MÁS largo que el statement_timeout de authenticated
// (8 s): con la base lenta, la base corta primero y responde 57014 (volvió atrás
// entera: 503 temporarily_unavailable, se reintenta seguro), en vez de cortar el edge
// sin respuesta (503 outcome_unknown: no se sabe si se hizo).
const PLAZO_ADMIN_MS = 3_000;
const PLAZO_YO_MS = 10_000;
// Si la base tardó más que esto en buscar la key y contar el cupo, una escritura no
// se intenta (503 writes_paused): con la base lenta, mejor no sumarle carga.
const BASE_LENTA_MS = 1_500;

const corsHeaders = (req: Request) =>
  corsFor(req, {
    "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    // Sin esto un navegador no deja leer el cupo que queda.
    "Access-Control-Expose-Headers": "X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After",
  });

// Cabeceras que van en TODAS las respuestas de un pedido (el cupo que le queda a la
// llave), una vez que se conocen. Por pedido y sin estado compartido entre pedidos.
const cabecerasDelPedido = new WeakMap<Request, Record<string, string>>();

const json = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) => {
  const cors = corsHeaders(req);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      ...(cabecerasDelPedido.get(req) ?? {}),
      ...extra,
      // El texto depende de Accept-Language: se SUMA al Vary: Origin del CORS, no lo pisa.
      "Vary": varyConIdioma(cors["Vary"]),
    },
  });
};

// Un fallo NUESTRO (la base no respondió) no puede verse como "tu llave es
// inválida" ni como "no tienes permiso": el cliente dejaría de reintentar, o
// revocaría una llave que está bien.
const noDisponible = (req: Request, donde: string, err: unknown) => {
  console.error(`[public-api] ${donde}:`, (err as { message?: string })?.message ?? err);
  return json(req, {
    error: "temporarily_unavailable",
    message: msg(idiomaDelPedido(req), "no_disponible"),
  }, 503, { "Retry-After": "30" });
};

// La llave vive mientras la persona como la que actúa siga vigente: sin baja, sin
// bloqueo y en la agencia de la llave. Si no, deja de servir aunque nadie se haya
// acordado de revocarla.
const personaNoVigente = (req: Request) =>
  json(req, {
    error: "unauthorized",
    message: msg(idiomaDelPedido(req), "persona_no_vigente"),
  }, 401);

async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// --- Normalización de redes: { handle, url } por red. Si el valor ya es URL, se respeta. ---
const SOCIAL_BASE: Record<string, string> = {
  instagram: "https://instagram.com/", tiktok: "https://tiktok.com/@", twitter: "https://x.com/",
  youtube: "https://youtube.com/@", facebook: "https://facebook.com/", reddit: "https://reddit.com/user/",
  telegram: "https://t.me/", linkedin: "https://linkedin.com/in/",
};
function social(kind: string, value: unknown): { handle: string | null; url: string | null } | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const isUrl = /^https?:\/\//i.test(raw) || /\b[\w-]+\.(com|me|tv|net|org|io|link|to)\b/i.test(raw);
  if (isUrl) return { handle: null, url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` };
  const handle = raw.replace(/^@+/, "");
  const base = SOCIAL_BASE[kind];
  return { handle, url: base ? `${base}${handle}` : null };
}
function urlOnly(value: unknown): { url: string } | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return { url: /^https?:\/\//i.test(raw) ? raw : `https://${raw}` };
}

type Row = Record<string, unknown> & { id: string };

function shapeCreator(c: Row, ofAccounts: Array<{ account_handle: string | null; onlyfans_url: string | null }>) {
  const socials: Record<string, unknown> = {};
  const put = (k: string, v: unknown) => { if (v) socials[k] = v; };
  put("instagram", social("instagram", c.instagram_handle));
  put("tiktok", social("tiktok", c.tiktok_handle));
  put("twitter", social("twitter", c.twitter_handle));
  put("youtube", social("youtube", c.youtube_handle));
  put("facebook", social("facebook", c.facebook_handle));
  put("reddit", social("reddit", c.reddit_handle));
  put("telegram", social("telegram", c.telegram_handle));
  put("linkedin", social("linkedin", c.linkedin_handle));
  put("onlyfans", urlOnly(c.onlyfans_url));
  put("other", urlOnly(c.other_url ?? c.link_otras_plataformas));
  const of = ofAccounts
    .map((a) => ({ handle: a.account_handle ?? null, url: urlOnly(a.onlyfans_url)?.url ?? null }))
    .filter((a) => a.handle || a.url);
  return {
    id: c.id, name: c.name ?? null, artistic_name: c.artistic_name ?? null,
    category: c.category ?? null, status: c.status ?? null,
    country: c.country ?? null, city: c.city ?? null,
    instagram_followers: c.instagram_followers ?? null,
    socials, onlyfans_accounts: of, updated_at: c.updated_at ?? null,
  };
}

const CREATOR_COLUMNS =
  "id, name, artistic_name, category, status, country, city, instagram_followers, " +
  "instagram_handle, tiktok_handle, twitter_handle, youtube_handle, linkedin_handle, " +
  "facebook_handle, reddit_handle, telegram_handle, onlyfans_url, other_url, link_otras_plataformas, updated_at";

function pageParams(url: URL, defLimit = 100, maxLimit = 500) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? String(defLimit), 10) || defLimit, 1), maxLimit);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);
  return { limit, offset };
}

Deno.serve(async (req) => {
  // Antes de buscar la key: lo que tarda la base cuenta desde aquí.
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  const idioma = idiomaDelPedido(req);
  const metodo = req.method;
  if (!esMetodo(metodo)) {
    return json(req, {
      error: "method_not_allowed",
      message: msg(idioma, "metodo_no_permitido", { permitidos: METODOS.join(", ") }),
    }, 405, { "Allow": METODOS.join(", ") });
  }

  // --- Auth por API key ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const rawKey = (req.headers.get("X-API-Key") || bearer || "").trim();
  if (!rawKey || !rawKey.startsWith("mvk_")) {
    return json(req, { error: "unauthorized", message: msg(idioma, "falta_llave") }, 401);
  }

  // En una escritura, sin reintentos escondidos y con plazo (fetchSinReintentos). Las
  // lecturas siguen como siempre: los recursos viejos no cambian de comportamiento.
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    metodo === "GET" ? {} : { global: { fetch: fetchSinReintentos(PLAZO_ADMIN_MS) } },
  );

  const key_hash = await sha256hex(rawKey);
  const { data: keyRow, error: keyErr } = await admin
    .from("api_keys")
    .select("id, name, scopes, ip_whitelist, revoked_at, expires_at, tenant_id")
    .eq("key_hash", key_hash).maybeSingle();
  // Antes el error se descartaba y una base caída respondía "API key inválida".
  // Además es la red si esta función se desplegara antes que la migración que crea
  // la columna tenant_id: 503 y no 401 para todas las llaves.
  if (keyErr) return noDisponible(req, "búsqueda de la llave", keyErr);

  if (!keyRow) return json(req, { error: "unauthorized", message: msg(idioma, "llave_invalida") }, 401);
  if (keyRow.revoked_at) return json(req, { error: "unauthorized", message: msg(idioma, "llave_revocada") }, 401);
  if (keyRow.expires_at && new Date(keyRow.expires_at as string).getTime() <= Date.now()) {
    return json(req, { error: "unauthorized", message: msg(idioma, "llave_vencida") }, 401);
  }
  const ip = clientIp(req);
  if (!ipAllowed(ip, (keyRow.ip_whitelist as string[]) ?? [])) {
    return json(req, {
      error: "forbidden",
      message: msg(idioma, "ip_no_permitida", { ip: ip ?? msg(idioma, "ip_desconocida") }),
    }, 403);
  }
  const scopes: string[] = (keyRow.scopes as string[]) ?? [];
  const need = (s: string) => scopes.includes(s);

  // De qué agencia es esta llave. La columna es NOT NULL, así que esto no debería
  // pasar nunca; si pasa, se corta aquí: una llave sin agencia no puede servir nada
  // sin arriesgar datos de otra.
  const tenantId = keyRow.tenant_id as string | null;
  if (!tenantId) {
    return json(req, { error: "unauthorized", message: msg(idioma, "llave_sin_agencia") }, 401);
  }

  // --- Límite por hora + como quién actúa la llave: una ida a la base por pedido ---
  // Reemplaza a increment_api_key_usage (la misma fila, la misma escritura, con la
  // ventana sumada). Pasado el límite NO escribe: rechaza leyendo, para que una llave
  // desbocada no se convierta en escrituras sobre la base. Va DESPUÉS de la
  // whitelist: si no, alguien con la llave filtrada pero desde otra IP podría
  // gastarle el cupo al dueño.
  //
  // Si el contador falla, los recursos de siempre se sirven igual: un contador caído
  // no puede dejar sin servicio a todas las integraciones, y antes de esto no había
  // límite ninguno. Lo que actúa como usuario, en cambio, se cierra con 503: sin esta
  // respuesta no se sabe como quién actuar.
  type Consumo = {
    permitido: boolean; limite: number; restantes: number; reinicio: string;
    actua_como: string | null; usuario_activo: boolean;
    // Del freno por minuto. Opcionales: antes de su migración no vienen.
    limite_minuto?: number | null; motivo?: "hora" | "minuto" | null;
  };
  const { data: consumoFilas, error: consumoErr } = await admin
    .rpc("api_key_consumir", { _id: keyRow.id as string });
  if (consumoErr) console.error("[public-api] límite por hora:", consumoErr.message);
  // Sin contador, una ESCRITURA no sigue: se corta aquí, antes de api_key_vigente y del
  // conteo de agencias (una lectura se sirve igual, como siempre).
  if (consumoErr && metodo !== "GET") return noDisponible(req, "límite por hora (escritura)", consumoErr);
  const consumo: Consumo | null = consumoErr
    ? null
    : ((Array.isArray(consumoFilas) ? consumoFilas[0] : consumoFilas) as Consumo | undefined) ?? null;
  if (consumo) {
    const { porMinuto, cabeceras, esperaSeg: espera } = cabecerasDeCupo(consumo, Date.now());
    cabecerasDelPedido.set(req, cabeceras);
    if (!consumo.permitido) {
      return json(req, {
        error: "rate_limited",
        message: porMinuto
          ? msg(idioma, "limite_por_minuto", { n: consumo.limite_minuto ?? 60, s: espera })
          : msg(idioma, "limite_por_hora", { n: consumo.limite, hora: consumo.reinicio }),
      }, 429, { "Retry-After": String(espera) });
    }
    if (!consumo.usuario_activo) return personaNoVigente(req);
  } else {
    // El contador falló (p. ej. la base en modo solo lectura). El límite queda
    // abierto a propósito, pero la baja no: una sola lectura, y solo en este camino.
    // Si tampoco responde (o la migración todavía no está), no se sabe: se sirve.
    const { data: vigente, error: vErr } = await admin.rpc("api_key_vigente", { _id: keyRow.id as string });
    if (vErr) console.error("[public-api] persona de la llave:", vErr.message);
    if (!vErr && vigente === false) return personaNoVigente(req);
  }

  // Cuántas agencias hay en Maven. Los recursos que no saben de qué agencia es cada
  // fila solo se sirven cuando la respuesta es exactamente 1. Si la consulta falla,
  // null: `decidir` cierra con 503, no con 403.
  const { count: agencias, error: agErr } = await admin
    .from("tenants").select("id", { count: "exact", head: true });
  if (agErr) console.error("[public-api] conteo de agencias:", agErr.message);
  const cantidadDeAgencias = agErr ? null : (agencias ?? null);
  // Cuánto tardó la base en buscar la key, el cupo y el conteo (sin lo que tarde el
  // cliente en mandar el cuerpo, que se lee después).
  const demoraDeLaBase = Date.now() - t0;

  // --- Routing ---
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idx = parts.indexOf("public-api");
  const rest = idx >= 0 ? parts.slice(idx + 1) : parts;
  const resource = rest[0] ?? "";
  const sub = rest[1] ?? null;

  if (!resource) {
    if (metodo !== "GET") {
      return json(req, {
        error: "method_not_allowed",
        message: msg(idioma, "metodo_no_permitido", { permitidos: "GET" }),
      }, 405, { "Allow": "GET" });
    }
    return json(req, {
      object: "api", name: "Maven Public API", version: "v1", your_scopes: scopes,
      // Toda respuesta de esta llave es de esta agencia y de ninguna otra.
      agency_id: tenantId,
      resources: [
        { path: "/me", scope: null },
        { path: "/messenger/conversations", scope: "messenger:read" },
        { path: "/messenger/conversations/{id}", scope: "messenger:read" },
        { path: "/messenger/conversations/{id}/messages", scope: "messenger:read" },
        { path: "/messenger/feed", scope: "messenger:read" },
        // Escribir: messenger:write (que va siempre con messenger:read).
        { method: "GET", path: "/messenger/people", scope: "messenger:write" },
        { method: "POST", path: "/messenger/conversations", scope: "messenger:write" },
        { method: "POST", path: "/messenger/conversations/{id}/messages", scope: "messenger:write" },
        { method: "PATCH", path: "/messenger/conversations/{id}/messages/{message_id}", scope: "messenger:write" },
        { method: "DELETE", path: "/messenger/conversations/{id}/messages/{message_id}", scope: "messenger:write" },
        // La plataforma de la agencia manda el equipo (ensayo hasta que el dueño prenda
        // «aplicar») y lee cómo quedó, las horas, las notas y lo de Argos.
        { method: "GET", path: "/equipo", scope: "equipo:write" },
        { method: "POST", path: "/equipo/sync", scope: "equipo:write" },
        { method: "GET", path: "/equipo/horas", scope: "equipo:write" },
        { method: "GET", path: "/equipo/notas", scope: "equipo:write" },
        { method: "GET", path: "/equipo/argos", scope: "equipo:write" },
        // Subir personalizados a la carpeta de la modelo (Personalizados/<día>).
        { method: "POST", path: "/contenido/subidas", scope: "contenido:write" },
        { method: "POST", path: "/contenido/subidas/{id}/listo", scope: "contenido:write" },
        { method: "GET", path: "/contenido/subidas/{id}", scope: "contenido:write" },
        { path: "/creators", scope: "creators:read" },
        { path: "/creators/{id}", scope: "creators:read" },
        { path: "/contacts", scope: "contacts:read" },
        { path: "/contacts/{id}", scope: "contacts:read" },
        { path: "/employees", scope: "employees:read" },
        { path: "/employees/{id}", scope: "employees:read" },
        { path: "/hubstaff", scope: "hubstaff:read" },
        { path: "/attendance", scope: "attendance:read" },
        { path: "/argos/notas", scope: "argos:read" },
        { path: "/argos/screens", scope: "argos:read" },
        { path: "/cowork/time", scope: "cowork:read" },
        { path: "/cowork/time/segments", scope: "cowork:read" },
        { path: "/cowork/breaks", scope: "cowork:read" },
        { path: "/cowork/meets", scope: "cowork:read" },
        { path: "/sales", scope: "sales:read" },
        { path: "/sales/chatters", scope: "sales:chatters" },
        { path: "/promolog", scope: "promolog:read" },
      ],
    });
  }

  // ===== Puerta de aislamiento =====
  // Todo recurso pasa por aquí ANTES de tocar la base. Ver ./aislamiento.ts.
  const recursoClave = resource === "sales" && sub === "chatters" ? "sales/chatters" : resource;
  const veredicto = decidir(recursoClave, cantidadDeAgencias, AISLAMIENTO_POR_RECURSO, idioma);
  if (!veredicto.ok) {
    // Al log va un texto FIJO en español (el mismo comienzo que antes) y no
    // `veredicto.motivo`, que viene en el idioma del cliente: una búsqueda o una alerta
    // sobre el log no puede depender del Accept-Language de quien llamó.
    if (veredicto.estado === 503) {
      return noDisponible(req, "puerta de aislamiento", `No se pudo verificar el aislamiento entre agencias (conteo: ${cantidadDeAgencias})`);
    }
    return json(req, { error: veredicto.error, message: veredicto.motivo }, veredicto.estado);
  }

  // /contenido (subir personalizados, ver ./contenido.ts): sin su scope no se lee nada.
  const esContenido = recursoClave === "contenido";
  if (esContenido && !need("contenido:write")) {
    return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "contenido:write" }) }, 403);
  }

  // ===== Escrituras: lo que se mira antes de tocar el recurso =====
  // (1) Solo los recursos como_usuario se escriben; los demás, 405 SIN leer el cuerpo.
  // La excepción es /contenido, que escribe con service_role atado a la agencia.
  if (metodo !== "GET" && !esComoUsuario(recursoClave)) {
    if (!esContenido) {
      return json(req, {
        error: "method_not_allowed",
        message: msg(idioma, "metodo_no_permitido", { permitidos: "GET" }),
      }, 405, { "Allow": "GET" });
    }
  }
  // (2) El cuerpo, solo de un POST/PATCH a una ruta que existe con ese método (lo
  // demás lo contesta servirComoUsuario: 404 o 405, sin cuerpo). Tope de 64 KB.
  let cuerpo: ObjetoJson | null = null;
  // En /contenido solo la creación trae cuerpo («listo» va sin cuerpo).
  const rutaDeContenidoPedida = esContenido ? rutaDeContenido(metodo, rest.slice(1)) : null;
  const rutaDeEscritura = rutaDeContenidoPedida
    ? { ok: rutaDeContenidoPedida.ok && rutaDeContenidoPedida.accion === "crear" }
    : scopesDeLaRuta(recursoClave, metodo, rest.slice(1));
  if ((metodo === "POST" || metodo === "PATCH") && rutaDeEscritura.ok) {
    const leido = await leerCuerpo(req, CUERPO_MAX_BYTES);
    if (!leido.ok && leido.estado === 413) return json(req, { error: "payload_too_large", message: msg(idioma, "cuerpo_muy_grande") }, 413);
    if (!leido.ok && leido.estado === 415) return json(req, { error: "unsupported_media_type", message: msg(idioma, "tipo_de_contenido") }, 415);
    if (!leido.ok) return json(req, { error: "invalid_json", message: msg(idioma, "cuerpo_mal_codificado") }, 400);
    const objeto = leerCuerpoDeEscritura(leido.texto);
    if (!objeto.ok && objeto.problema === "json_invalido") return json(req, { error: "invalid_json", message: msg(idioma, "cuerpo_json_invalido") }, 400);
    if (!objeto.ok) return json(req, { error: "invalid_json", message: msg(idioma, "cuerpo_no_es_objeto") }, 400);
    cuerpo = objeto.cuerpo;
  }
  // (3) La Idempotency-Key de un POST: si vino, que tenga la forma (la exige el handler).
  let idempotencia: string | null = null;
  if (metodo === "POST") {
    const idem = leerIdempotencia(req.headers.get("Idempotency-Key"));
    if (!idem.ok) return json(req, { error: "invalid_idempotency_key", message: msg(idioma, "idempotencia_invalida") }, 400);
    idempotencia = idem.valor;
  }
  // (4) Con la base lenta, una escritura no se intenta.
  if (metodo !== "GET" && demoraDeLaBase > BASE_LENTA_MS) {
    console.error(`[public-api] escritura en pausa: la base tardó ${demoraDeLaBase} ms en la key y el cupo`);
    return json(req, { error: "writes_paused", message: msg(idioma, "escritura_en_pausa") }, 503, { "Retry-After": "30" });
  }

  // ===== /contenido: subir personalizados a la carpeta de la modelo =====
  if (esContenido) {
    try {
      const r = await servirContenido({
        admin,
        agencia: tenantId,
        llaveId: keyRow.id as string,
        llaveNombre: String(keyRow.name ?? "API"),
        metodo,
        ruta: rest.slice(1),
        cuerpo,
        idempotencia,
        supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
        anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        servicio: { key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", cronToken: Deno.env.get("CRON_INTERNAL_TOKEN") ?? "" },
      });
      return json(req, r.cuerpo, r.estado, r.permitidos ? { "Allow": r.permitidos.join(", ") } : {});
    } catch (e) {
      if (metodo !== "GET") {
        console.error("[public-api] /contenido:", (e as { message?: string })?.message ?? e);
        return json(req, { error: "outcome_unknown", message: msg(idioma, "resultado_incierto") }, 503, { "Retry-After": "5" });
      }
      return noDisponible(req, "/contenido", e);
    }
  }

  // ===== Recursos que actúan como la persona de la llave =====
  // Sin service_role: la pared es la RLS de la base. Ver ./recursos-como-usuario.ts.
  if (esComoUsuario(recursoClave)) {
    if (!consumo?.actua_como) return noDisponible(req, "como quién actúa la llave", consumoErr ?? "sin respuesta");
    if (!comoUsuarioConfigurado()) return noDisponible(req, "sesión como usuario", "falta el secreto MAVEN_JWT_SECRET");
    // La sesión de la persona de la key, con el id de ESTA key en el claim `mvk` (sale de
    // la fila encontrada por el hash, nunca del pedido): la base la valida en cada
    // escritura. Sin reintentos escondidos y con plazo.
    let yo: Awaited<ReturnType<typeof clienteDeLlave>>;
    try {
      yo = await clienteDeLlave(consumo.actua_como, keyRow.id as string, { fetch: fetchSinReintentos(PLAZO_YO_MS) });
    } catch (e) {
      return noDisponible(req, "sesión como usuario", e);
    }
    if (!yo) return noDisponible(req, "sesión como usuario", "falta el secreto MAVEN_JWT_SECRET");
    let r: Awaited<ReturnType<typeof servirComoUsuario>>;
    try {
      r = await servirComoUsuario(recursoClave, yo, {
        agenciaDeLaLlave: tenantId,
        actuaComo: consumo.actua_como,
        scopes,
        ruta: rest.slice(1),
        consulta: Object.fromEntries(url.searchParams),
        llave: {
          conWhitelist: ((keyRow.ip_whitelist as string[] | null) ?? []).length > 0,
          venceEl: (keyRow.expires_at as string | null) ?? null,
        },
        baseDeArchivos: Deno.env.get("SUPABASE_URL") ?? "",
        cupo: { limite: consumo.limite, restantes: consumo.restantes, reinicio: consumo.reinicio },
        idioma,
        metodo,
        cuerpo,
        idempotencia,
      });
    } catch (e) {
      // Una caída de red hacia la base no puede salir como un 500 sin CORS. Y en una
      // escritura no se sabe si llegó a hacerse: se dice así (lección #1868).
      if (metodo !== "GET") {
        console.error(`[public-api] /${recursoClave} (${metodo}):`, (e as { message?: string })?.message ?? e);
        return json(req, { error: "outcome_unknown", message: msg(idioma, "resultado_incierto") }, 503, { "Retry-After": "5" });
      }
      return noDisponible(req, `/${recursoClave}`, e);
    }
    if (r.ok) return json(req, r.cuerpo, r.estado);
    if ("detalle" in r) return noDisponible(req, `/${recursoClave}`, r.detalle);
    if (r.estado === 405) return json(req, { error: r.error, message: r.mensaje }, 405, { "Allow": r.permitidos.join(", ") });
    if (r.estado === 429) {
      return json(req, { error: r.error, message: r.mensaje, limit: r.limite, retry_after: r.reintentarEnSeg }, 429, {
        "Retry-After": String(r.reintentarEnSeg),
      });
    }
    if (r.estado === 503) return json(req, { error: r.error, message: r.mensaje }, 503, { "Retry-After": String(r.reintentarEnSeg) });
    return json(req, { error: r.error, message: r.mensaje }, r.estado);
  }

  // ===== /creators =====
  if (resource === "creators") {
    if (!need("creators:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "creators:read" }) }, 403);

    if (sub) {
      const { data: c, error } = await admin.from("creators").select(CREATOR_COLUMNS).eq("id", sub).maybeSingle();
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      if (!c) return json(req, { error: "not_found", message: msg(idioma, "creadora_no_encontrada") }, 404);
      const { data: ofa } = await admin.from("creator_of_accounts").select("account_handle, onlyfans_url").eq("creator_id", sub);
      return json(req, { object: "creator", data: shapeCreator(c as unknown as Row, ofa ?? []) });
    }

    const status = url.searchParams.get("status") ?? "active";
    const { limit, offset } = pageParams(url);
    let q = admin.from("creators").select(CREATOR_COLUMNS, { count: "exact" });
    if (status !== "all") q = q.eq("status", status);
    q = q.order("name", { ascending: true }).range(offset, offset + limit - 1);
    const { data: rows, count, error } = await q;
    if (error) return json(req, { error: "server_error", message: error.message }, 500);

    const ids = (rows ?? []).map((r) => (r as unknown as Row).id);
    const ofByCreator = new Map<string, Array<{ account_handle: string | null; onlyfans_url: string | null }>>();
    if (ids.length) {
      const { data: ofa } = await admin.from("creator_of_accounts").select("creator_id, account_handle, onlyfans_url").in("creator_id", ids);
      for (const a of ofa ?? []) {
        const cid = (a as { creator_id: string }).creator_id;
        if (!ofByCreator.has(cid)) ofByCreator.set(cid, []);
        ofByCreator.get(cid)!.push(a as { account_handle: string | null; onlyfans_url: string | null });
      }
    }
    const data = (rows ?? []).map((r) => {
      const row = r as unknown as Row;
      return shapeCreator(row, ofByCreator.get(row.id) ?? []);
    });
    return json(req, { object: "list", resource: "creators", count: count ?? data.length, limit, offset, data });
  }

  // ===== /contacts =====
  // Directorio comercial: modelos, AGENCIAS y ex-creadoras (closers_contacts).
  // Las agencias NO son un recurso aparte: son este mismo con kind=agencia — viven
  // en la misma tabla separadas por contact_kind, y darles endpoint propio duplicaba
  // el codigo sin agregar un solo campo.
  //
  // ⚠️ PII: telefono y email van ENMASCARADOS salvo que la key tenga contacts:phone.
  // Dentro de Maven ese dato esta restringido a admins (columna solo-admin + permiso
  // "Ver Telefonos" + vista enmascarada), y una API key corre con service_role: se
  // saltea las tres capas. El scope separado es lo unico que la frena, y permite
  // revocar el telefono sin cortar el resto del acceso.
  if (resource === "contacts") {
    if (!need("contacts:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "contacts:read" }) }, 403);
    const conPii = need("contacts:phone");

    const COLS = "id, name, handle, platform, email, phone, country_code, city, company, " +
      "status, source, contact_kind, record_type, onlyfans_url, created_at, updated_at";

    // Enmascarado: se conservan los ultimos 4 digitos, que alcanzan para cotejar sin
    // entregar el numero. El booleano permite contar cobertura sin ver el dato.
    const enmascararTel = (t: unknown): string | null => {
      const s = String(t ?? "").trim();
      if (!s) return null;
      const d = s.replace(/\D/g, "");
      return d.length >= 4 ? `*****${d.slice(-4)}` : "*****";
    };
    const enmascararMail = (m: unknown): string | null => {
      const s = String(m ?? "").trim();
      if (!s || !s.includes("@")) return s ? "*****" : null;
      const [u, dom] = s.split("@");
      return `${u.slice(0, 1)}***@${dom}`;
    };
    const shape = (c: Row) => ({
      id: c.id,
      nombre: c.name ?? null,
      handle: c.handle ?? null,
      plataforma: c.platform ?? null,
      tipo: c.contact_kind ?? null,           // modelo | agencia | ex_creadora
      estado: c.status ?? null,
      empresa: c.company ?? null,
      pais_codigo: c.country_code ?? null,
      ciudad: c.city ?? null,
      onlyfans_url: c.onlyfans_url ?? null,
      origen: c.source ?? null,               // de que base salio (import, contacto_directo…)
      registro: c.record_type ?? null,        // nuevo | reactivado
      tiene_telefono: !!String(c.phone ?? "").trim(),
      telefono: conPii ? (c.phone ?? null) : enmascararTel(c.phone),
      email: conPii ? (c.email ?? null) : enmascararMail(c.email),
      creado_at: c.created_at ?? null,
      actualizado_at: c.updated_at ?? null,
    });

    if (sub) {
      const { data: c, error } = await admin.from("closers_contacts").select(COLS).eq("id", sub).maybeSingle();
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      if (!c) return json(req, { error: "not_found", message: msg(idioma, "contacto_no_encontrado") }, 404);
      return json(req, { object: "contact", pii: conPii, data: shape(c as unknown as Row) });
    }

    const { limit, offset } = pageParams(url);
    const kind = url.searchParams.get("kind");        // modelo | agencia | ex_creadora
    const status = url.searchParams.get("status");    // new | converted | ...
    const country = url.searchParams.get("country");
    const conTel = url.searchParams.get("con_telefono"); // "true" = solo los que tienen

    let q = admin.from("closers_contacts").select(COLS, { count: "exact" });
    if (kind) {
      const validos = ["modelo", "agencia", "ex_creadora"];
      if (!validos.includes(kind)) {
        return json(req, { error: "bad_request", message: msg(idioma, "kind_invalido", { opciones: validos.join(" | ") }) }, 400);
      }
      q = q.eq("contact_kind", kind);
    }
    if (status) q = q.eq("status", status);
    if (country) q = q.eq("country_code", country);
    if (conTel === "true") q = q.not("phone", "is", null);
    q = q.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

    const { data: rows, count, error } = await q;
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    return json(req, {
      object: "list", resource: "contacts",
      pii: conPii,
      count: count ?? (rows ?? []).length, limit, offset,
      data: (rows ?? []).map((r) => shape(r as unknown as Row)),
    });
  }

  // ===== /employees =====
  if (resource === "employees") {
    if (!need("employees:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "employees:read" }) }, 403);

    // /employees/{id} → perfil completo (nivel, turno, horarios, status, deleted_at).
    if (sub) {
      const { data: p, error } = await admin
        .from("profiles")
        .select("id, full_name, avatar_url, is_owner, nivel, hora_entrada, hora_salida, comida_min, bano_min, turno_id, status, status_text, status_expires_at, exonera_camara_pantalla, deleted_at, deleted_by, created_at")
        .eq("id", sub)
        .maybeSingle();
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      if (!p) return json(req, { error: "not_found", message: msg(idioma, "empleado_no_encontrado") }, 404);
      const row = p as Record<string, unknown>;
      const { data: ur } = await admin.from("user_roles").select("role").eq("user_id", sub).maybeSingle();
      let turno: Record<string, unknown> | null = null;
      if (row.turno_id) {
        const { data: t } = await admin.from("rol_turnos").select("id, nombre, hora_entrada, hora_salida").eq("id", row.turno_id).maybeSingle();
        turno = (t ?? null) as Record<string, unknown> | null;
      }
      return json(req, {
        object: "employee", id: row.id,
        name: row.full_name ?? null, role: (ur as { role?: string } | null)?.role ?? null,
        level: row.nivel ?? null,
        is_owner: row.is_owner ?? false,
        avatar_url: row.avatar_url ?? null,
        status: row.status ?? null, status_text: row.status_text ?? null, status_expires_at: row.status_expires_at ?? null,
        shift: turno,
        schedule: {
          entry_time: row.hora_entrada ?? turno?.hora_entrada ?? null,
          exit_time: row.hora_salida ?? turno?.hora_salida ?? null,
          lunch_minutes: row.comida_min ?? null,
          bathroom_minutes: row.bano_min ?? null,
        },
        camera_screen_exempt: row.exonera_camara_pantalla === true,
        deleted_at: row.deleted_at ?? null, deleted_by: row.deleted_by ?? null,
        created_at: row.created_at ?? null,
      });
    }

    const { limit, offset } = pageParams(url);
    const roleFilter = url.searchParams.get("role");

    // Defensa extra, NO el aislamiento: tenant_members todavía no es confiable (ver
    // ./aislamiento.ts) y por eso /employees se apaga con 2+ agencias. profiles no
    // tiene columna de agencia; las personas se separan por tenant_members.
    const { data: miembros, error: mErr } = await admin
      .from("tenant_members").select("user_id").eq("tenant_id", tenantId);
    if (mErr) return json(req, { error: "server_error", message: mErr.message }, 500);
    const idsDeLaAgencia = (miembros ?? []).map((m) => (m as { user_id: string }).user_id);
    if (idsDeLaAgencia.length === 0) {
      return json(req, { object: "list", resource: "employees", count: 0, limit, offset, data: [] });
    }

    const { data: profs, count, error } = await admin
      .from("profiles")
      .select("id, full_name, avatar_url, is_owner, created_at", { count: "exact" })
      .in("id", idsDeLaAgencia)
      .order("full_name", { ascending: true }).range(offset, offset + limit - 1);
    if (error) return json(req, { error: "server_error", message: error.message }, 500);

    const ids = (profs ?? []).map((p) => (p as { id: string }).id);
    const roleById = new Map<string, string>();
    if (ids.length) {
      const { data: roles } = await admin.from("user_roles").select("user_id, role").in("user_id", ids);
      for (const r of roles ?? []) roleById.set((r as { user_id: string }).user_id, (r as { role: string }).role);
    }
    let data = (profs ?? []).map((p) => {
      const row = p as { id: string; full_name: string | null; avatar_url: string | null; is_owner: boolean | null; created_at: string | null };
      return {
        id: row.id, name: row.full_name ?? null, role: roleById.get(row.id) ?? null,
        is_owner: row.is_owner ?? false, avatar_url: row.avatar_url ?? null, created_at: row.created_at ?? null,
      };
    });
    if (roleFilter) data = data.filter((e) => (e.role ?? "").toLowerCase() === roleFilter.toLowerCase());
    return json(req, { object: "list", resource: "employees", count: roleFilter ? data.length : (count ?? data.length), limit, offset, data });
  }

  // ===== /sales =====
  if (resource === "sales") {
    // /sales/chatters -> ventas por chatter
    if (sub === "chatters") {
      if (!need("sales:chatters")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "sales:chatters" }) }, 403);
      const { limit, offset } = pageParams(url);
      let q = admin.from("chatter_daily_sales")
        .select("blu_employee_id, date, name, total_sales, sold_messages, fans_chatted", { count: "exact" });
      const from = url.searchParams.get("from"), to = url.searchParams.get("to");
      if (from) q = q.gte("date", from);
      if (to) q = q.lte("date", to);
      q = q.order("date", { ascending: false }).range(offset, offset + limit - 1);
      const { data: rows, count, error } = await q;
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      const data = (rows ?? []).map((r) => {
        const x = r as Record<string, unknown>;
        return {
          date: x.date, chatter: x.name ?? null, blu_employee_id: x.blu_employee_id ?? null,
          total_sales: x.total_sales ?? 0, sold_messages: x.sold_messages ?? 0, fans_chatted: x.fans_chatted ?? 0,
        };
      });
      return json(req, { object: "list", resource: "sales/chatters", count: count ?? data.length, limit, offset, data });
    }
    if (sub) return json(req, { error: "not_found", message: msg(idioma, "sales_sub_recurso_desconocido", { sub }) }, 404);

    // /sales -> ganancias diarias por creadora
    if (!need("sales:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "sales:read" }) }, 403);
    const { limit, offset } = pageParams(url);
    let q = admin.from("creator_daily_earnings").select(
      "date, creator_id, blu_creator_name, total_gross, subscription_gross, new_sub_gross, recurring_sub_gross, tips_gross, message_gross, post_gross, referral_gross, stream_gross, chargebacks_gross, contribution_pct, active_fans, new_fans",
      { count: "exact" },
    );
    // Defensa extra, NO el aislamiento: el tenant_id de esta tabla todavía no es
    // confiable (ver ./aislamiento.ts) y por eso /sales se apaga con 2+ agencias.
    // Queda para que la consulta ya esté bien el día que la columna diga la verdad.
    q = q.eq("tenant_id", tenantId);
    const from = url.searchParams.get("from"), to = url.searchParams.get("to"), creatorId = url.searchParams.get("creator_id");
    if (from) q = q.gte("date", from);
    if (to) q = q.lte("date", to);
    if (creatorId) q = q.eq("creator_id", creatorId);
    q = q.order("date", { ascending: false }).range(offset, offset + limit - 1);
    const { data: rows, count, error } = await q;
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    const data = (rows ?? []).map((r) => {
      const x = r as Record<string, unknown>;
      return {
        date: x.date, creator_id: x.creator_id ?? null, creator: x.blu_creator_name ?? null,
        total_gross: x.total_gross ?? 0,
        breakdown: {
          subscription: x.subscription_gross ?? 0, new_subscription: x.new_sub_gross ?? 0,
          recurring_subscription: x.recurring_sub_gross ?? 0, tips: x.tips_gross ?? 0,
          message: x.message_gross ?? 0, post: x.post_gross ?? 0,
          referral: x.referral_gross ?? 0, stream: x.stream_gross ?? 0, chargebacks: x.chargebacks_gross ?? 0,
        },
        contribution_pct: x.contribution_pct ?? null, active_fans: x.active_fans ?? null, new_fans: x.new_fans ?? null,
      };
    });
    return json(req, { object: "list", resource: "sales", count: count ?? data.length, limit, offset, data });
  }

  // ===== /hubstaff =====
  if (resource === "hubstaff") {
    if (!need("hubstaff:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "hubstaff:read" }) }, 403);
    const { limit, offset } = pageParams(url);
    const { data, error } = await admin.rpc("api_hubstaff_daily", {
      _from: url.searchParams.get("from"),
      _to: url.searchParams.get("to"),
      _profile_id: url.searchParams.get("profile_id"),
      _limit: limit,
      _offset: offset,
    });
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    return json(req, { object: "list", resource: "hubstaff", count: (data ?? []).length, limit, offset, data: data ?? [] });
  }

  // ===== /cowork/time  y  /cowork/time/segments =====
  // El reloj de Cowork (reemplazo de Hubstaff). `time` = por empleado y día,
  // con los segundos repartidos por estado. `time/segments` = cada tramo, al
  // detalle: inicio, fin, estado y motivo, sesión y sala.
  if (resource === "cowork") {
    if (!need("cowork:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "cowork:read" }) }, 403);
    if (sub !== "time" && sub !== "breaks" && sub !== "meets") return json(req, { error: "not_found", message: msg(idioma, "cowork_rutas") }, 404);
    const { limit, offset } = pageParams(url);
    const detalle = rest[2] === "segments";
    const params = {
      _from: url.searchParams.get("from"),
      _to: url.searchParams.get("to"),
      _profile_id: url.searchParams.get("profile_id"),
      _limit: limit,
      _offset: offset,
    };
    // Cada pausa al detalle: bathroom | break, duración, tope vigente de la
    // sesión y si se pasó. Pedido del jefe (08/09): "que la API lo tenga".
    if (sub === "breaks") {
      const { data, error } = await admin.rpc("api_cowork_breaks", params);
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      return json(req, { object: "list", resource: "cowork/breaks", count: (data ?? []).length, limit, offset, data: data ?? [] });
    }
    // Cada meet grupal (Jhon, 10/09): una fila por persona y meet, con quién lo
    // invocó, de qué sala vino y cuánto estuvo. Ese tiempo ya está dentro de
    // active_seconds en /cowork/time (group_meet_seconds lo separa).
    if (sub === "meets") {
      const { data, error } = await admin.rpc("api_cowork_meets", params);
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      return json(req, { object: "list", resource: "cowork/meets", count: (data ?? []).length, limit, offset, data: data ?? [] });
    }
    if (detalle) {
      const { data, error } = await admin.rpc("api_cowork_time_segments", params);
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      return json(req, { object: "list", resource: "cowork/time/segments", count: (data ?? []).length, limit, offset, data: data ?? [] });
    }
    const { data, error } = await admin.rpc("cowork_tiempo_diario", {
      _desde: params._from, _hasta: params._to, _user_id: params._profile_id, _limit: limit, _offset: offset,
    });
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    // El desglose de la pausa (baño vs break) sale del histórico de pausas, por
    // persona y día; se pega a cada fila. `paused_seconds` sigue siendo lo que
    // el reloj vio detenido por pausa; bathroom/break cuentan pausas cerradas.
    const pausasPorClave = new Map<string, Record<string, unknown>>();
    if ((data ?? []).length) {
      const { data: pausas } = await admin.rpc("cowork_pausas_resumen", {
        _desde: params._from, _hasta: params._to, _user_id: params._profile_id, _limit: 2000, _offset: 0,
      });
      for (const p of (pausas ?? []) as Record<string, unknown>[]) pausasPorClave.set(`${p.dia}|${p.user_id}`, p);
    }
    // Nombres en inglés y planos, como el resto de la API.
    const filas = (data ?? []).map((r: Record<string, unknown>) => {
      const pz = pausasPorClave.get(`${r.dia}|${r.user_id}`);
      return {
      date: r.dia,
      profile_id: r.user_id,
      employee: r.nombre,
      active_seconds: r.seg_activo,
      active_hours: r.horas_activas,
      group_meet_seconds: r.seg_meet ?? 0,
      paused_seconds: r.seg_pausa,
      bathroom_breaks: pz?.banos ?? 0,
      bathroom_seconds: pz?.seg_bano ?? 0,
      bathroom_limit_seconds: pz?.bano_limite_seg ?? null,
      bathroom_exceeded: pz?.bano_excedido ?? false,
      breaks: pz?.breaks ?? 0,
      break_seconds: pz?.seg_break ?? 0,
      break_limit_seconds: pz?.break_limite_seg ?? null,
      breaks_exceeded: pz?.breaks_excedidos ?? 0,
      break_excess_seconds: pz?.seg_break_de_mas ?? 0,
      no_camera_seconds: r.seg_sin_camara,
      no_screen_seconds: r.seg_sin_pantalla,
      away_seconds: r.seg_fuera_de_camara,
      // La sala se cayó. Se pagan hasta 10 min de caídas por hora (ya están
      // dentro de active_seconds); el resto, no. `?? 0` por si esta
      // edge sale antes que la migración: la clave no desaparece del JSON.
      disconnected_seconds: r.seg_sin_conexion ?? 0,
      disconnected_long_seconds: r.seg_sin_conexion_larga ?? 0,
      in_room_seconds: r.seg_en_sala,
      sessions: r.sesiones,
      first_join: r.primer_ingreso,
      last_leave: r.ultima_salida,
      };
    });
    return json(req, { object: "list", resource: "cowork/time", count: filas.length, limit, offset, data: filas });
  }

  // ===== /promolog =====
  if (resource === "promolog") {
    if (!need("promolog:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "promolog:read" }) }, 403);
    const { limit, offset } = pageParams(url);
    const { data, error } = await admin.rpc("api_promolog_daily", {
      _from: url.searchParams.get("from"),
      _to: url.searchParams.get("to"),
      _creator_id: url.searchParams.get("creator_id"),
      _network: url.searchParams.get("network"),
      _limit: limit,
      _offset: offset,
    });
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    return json(req, { object: "list", resource: "promolog", count: (data ?? []).length, limit, offset, data: data ?? [] });
  }

  // ===== /attendance (clock-in/out, horas trabajadas, tardanzas) =====
  if (resource === "attendance") {
    if (!need("attendance:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "attendance:read" }) }, 403);
    const { limit, offset } = pageParams(url);
    const { data, error } = await admin.rpc("api_attendance", {
      _from: url.searchParams.get("from"),
      _to: url.searchParams.get("to"),
      _profile_id: url.searchParams.get("profile_id"),
      _limit: limit, _offset: offset,
    });
    if (error) return json(req, { error: "server_error", message: error.message }, 500);
    const r = (data ?? { data: [], count: 0 }) as { data: unknown[]; count: number };
    return json(req, { object: "list", resource: "attendance", count: r.count ?? (r.data ?? []).length, limit, offset, data: r.data ?? [] });
  }

  // ===== /argos (notas + screens) =====
  if (resource === "argos") {
    if (!need("argos:read")) return json(req, { error: "forbidden", message: msg(idioma, "falta_scope", { scope: "argos:read" }) }, 403);
    const { limit, offset } = pageParams(url);

    if (sub === "notas") {
      const { data, error } = await admin.rpc("api_argos_notas", {
        _from: url.searchParams.get("from"),
        _to: url.searchParams.get("to"),
        _profile_id: url.searchParams.get("profile_id"),
        _limit: limit, _offset: offset,
      });
      if (error) return json(req, { error: "server_error", message: error.message }, 500);
      const r = (data ?? { data: [], count: 0 }) as { data: unknown[]; count: number };
      return json(req, { object: "list", resource: "argos/notas", count: r.count ?? (r.data ?? []).length, limit, offset, data: r.data ?? [] });
    }

    if (sub === "screens") {
      // Pantallazos de la cámara y de la pantalla, con el veredicto de la IA.
      // URL firmada (10 min) para la imagen original. Tope de limit 200.
      const topeLimit = Math.min(200, limit);
      const tipo = url.searchParams.get("tipo"); // "camara" | "pantalla" | null
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const profileId = url.searchParams.get("profile_id");

      let q = admin.from("monitor_capturas")
        .select("id, user_id, tipo, path, veredicto, cara_visible, fuera_de_lugar, room_nombre, created_at, en_nas, perdonado", { count: "exact" });
      if (profileId) q = q.eq("user_id", profileId);
      if (tipo && (tipo === "camara" || tipo === "pantalla")) q = q.eq("tipo", tipo);
      if (from) q = q.gte("created_at", from);
      if (to) q = q.lte("created_at", to);
      q = q.order("created_at", { ascending: false }).range(offset, offset + topeLimit - 1);
      const { data: rows, count, error } = await q;
      if (error) return json(req, { error: "server_error", message: error.message }, 500);

      const paths = ((rows ?? []) as Array<{ path: string | null }>).map((r) => r.path).filter(Boolean) as string[];
      const urlPorPath = new Map<string, string>();
      if (paths.length > 0) {
        // Firma de un rango (10 min). El bucket donde viven las capturas es "monitor".
        const { data: firmadas } = await admin.storage.from("monitor-capturas").createSignedUrls(paths, 600);
        for (const f of (firmadas ?? []) as Array<{ path?: string; signedUrl?: string }>) {
          if (f.path && f.signedUrl) urlPorPath.set(f.path, f.signedUrl);
        }
      }

      const data = ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: r.id,
        employee_id: r.user_id,
        kind: r.tipo,
        captured_at: r.created_at,
        room: r.room_nombre ?? null,
        verdict: r.veredicto ?? null,
        face_visible: r.cara_visible ?? null,
        off_task: r.fuera_de_lugar === true,
        forgiven: r.perdonado === true,
        archived_in_nas: r.en_nas === true,
        image_url: r.path ? (urlPorPath.get(r.path as string) ?? null) : null,
        image_url_expires_in_seconds: r.path && urlPorPath.has(r.path as string) ? 600 : null,
      }));
      return json(req, { object: "list", resource: "argos/screens", count: count ?? data.length, limit: topeLimit, offset, data });
    }

    return json(req, { error: "not_found", message: msg(idioma, "argos_rutas") }, 404);
  }

  return json(req, { error: "not_found", message: msg(idioma, "recurso_desconocido", { recurso: resource }) }, 404);
});
