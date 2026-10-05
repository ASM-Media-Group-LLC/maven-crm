// Cliente de Zoho Mail Admin API — provisión de casillas.
//
// CONTEXTO: estamos saliendo de Google Workspace ($16.80/usuario/mes)
// hacia Zoho (~$1-4/usuario/mes). Para que eso no se convierta en 60
// altas manuales, el alta de usuario en Maven tiene que crear la casilla
// sola. Este módulo es esa pieza.
//
// DISEÑO: todo devuelve un resultado tipado y NUNCA tira excepción por
// "no configurado". Mientras no existan los secrets de Zoho, cada
// función devuelve { ok: false, skipped: true } y el llamador sigue de
// largo. Así se puede desplegar el código antes de que Zoho exista, sin
// romper el alta de usuarios.

export interface ZohoResult<T = unknown> {
  ok: boolean;
  /** true = Zoho no está configurado todavía; no es un error. */
  skipped?: boolean;
  data?: T;
  error?: string;
  /** Status HTTP crudo de Zoho, para diagnosticar. */
  status?: number;
}

export interface ZohoAccount {
  /** Zoho lo devuelve como NÚMERO, no como string. */
  zuid?: string | number;
  accountId?: string;
  primaryEmailAddress?: string;
  displayName?: string;
  status?: string;
}

interface ZohoEnv {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  zoid: string;
  /** Data center: com | eu | in | com.au | jp. Default com. */
  dc: string;
}

function readEnv(): ZohoEnv | null {
  const clientId = Deno.env.get("ZOHO_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET");
  const refreshToken = Deno.env.get("ZOHO_REFRESH_TOKEN");
  const zoid = Deno.env.get("ZOHO_ZOID");
  if (!clientId || !clientSecret || !refreshToken || !zoid) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    zoid,
    dc: Deno.env.get("ZOHO_DC") ?? "com",
  };
}

export function zohoConfigured(): boolean {
  return readEnv() !== null;
}

// Cache del access token a nivel de módulo. Los isolates de Deno viven
// pocos minutos pero atienden varias requests; sin esto pedimos un token
// nuevo por cada alta. Zoho los emite con 1h de vida — dejamos 5 min de
// margen para no usar uno que expire en pleno vuelo.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(env: ZohoEnv): Promise<ZohoResult<string>> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return { ok: true, data: cachedToken.value };
  }

  const params = new URLSearchParams({
    refresh_token: env.refreshToken,
    client_id: env.clientId,
    client_secret: env.clientSecret,
    grant_type: "refresh_token",
  });

  let resp: Response;
  try {
    resp = await fetch(`https://accounts.zoho.${env.dc}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (e) {
    return { ok: false, error: `token fetch failed: ${(e as Error).message}` };
  }

  const raw = await resp.text();
  let body: { access_token?: string; expires_in?: number; error?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, status: resp.status, error: `token: respuesta no-JSON: ${raw.slice(0, 200)}` };
  }

  // OJO: Zoho devuelve 200 con {"error":"invalid_code"} cuando el
  // refresh token es inválido. Chequear resp.ok NO alcanza.
  if (!body.access_token) {
    return {
      ok: false,
      status: resp.status,
      error: `token: ${body.error ?? raw.slice(0, 200)}`,
    };
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + ((body.expires_in ?? 3600) - 300) * 1000,
  };
  return { ok: true, data: body.access_token };
}

async function zohoFetch<T>(
  path: string,
  init: RequestInit & { method: string },
): Promise<ZohoResult<T>> {
  const env = readEnv();
  if (!env) return { ok: false, skipped: true, error: "Zoho no configurado" };

  const tokenRes = await getAccessToken(env);
  if (!tokenRes.ok) return { ok: false, error: tokenRes.error, status: tokenRes.status };

  const url = `https://mail.zoho.${env.dc}/api/organization/${env.zoid}${path}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Zoho-oauthtoken ${tokenRes.data}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (e) {
    return { ok: false, error: `${init.method} ${path}: ${(e as Error).message}` };
  }

  const raw = await resp.text();
  let body: {
    data?: T & { errorCode?: string; moreInfo?: string };
    status?: { code?: number; description?: string };
  };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, status: resp.status, error: `respuesta no-JSON: ${raw.slice(0, 300)}` };
  }

  // OJO: `status.description` es SIEMPRE genérico ("Invalid Input"). El
  // motivo real viene en `data.errorCode` / `data.moreInfo`. Si solo
  // reportás el description, quedás sin saber qué campo está mal.
  const detail = body.data as { errorCode?: string; moreInfo?: string } | undefined;
  if (!resp.ok || detail?.errorCode) {
    const parts = [
      detail?.errorCode,
      detail?.moreInfo,
      body.status?.description,
    ].filter(Boolean);
    return {
      ok: false,
      status: body.status?.code ?? resp.status,
      error: parts.length ? parts.join(" — ") : raw.slice(0, 300),
    };
  }

  return { ok: true, status: resp.status, data: body.data as T };
}

/** Una página de /accounts. Extraído para poder testear la paginación sin
 *  red: el bug que esto arregla vivió meses porque no había forma de
 *  ejercitar el recorrido. */
export type PaginaDeCuentas = (
  start: number,
  limit: number,
) => Promise<ZohoResult<ZohoAccount[]>>;

const pedirPaginaDeCuentas: PaginaDeCuentas = (start, limit) =>
  zohoFetch<ZohoAccount[]>(`/accounts?start=${start}&limit=${limit}`, { method: "GET" });

/** Lista TODAS las casillas de la organización. Sirve de smoke test: si esto
 *  anda, las credenciales y el zoid están bien.
 *
 *  ⚠️ PAGINA, y esa es la razón de ser de esta función. El default de Zoho
 *  para /accounts es **10** — verificado el 21/09/2026 contra la organización
 *  real: sin parámetros devolvía 10 de 68. Y el resto del módulo usa esta
 *  lista para DECIDIR: si una casilla existe antes de borrarla, cuántos
 *  puestos quedan libres, si una dirección ya está ocupada. Una lista corta
 *  no da una respuesta corta, da una respuesta EQUIVOCADA y en silencio: de
 *  las 9 bajas de usuario que hubo hasta esa fecha, las 9 dejaron la casilla
 *  viva porque la persona no entraba en las primeras 10 filas.
 *
 *  `listGroups()` ya traía `limit=200` por exactamente este motivo; a
 *  /accounts nunca se le aplicó.
 *
 *  `start` y `limit` son los parámetros que usa la propia consola de Zoho
 *  (se la ve pedir `?start=50&limit=50` al pasar de página).
 *
 *  Si una página falla, falla TODO: devolver la lista a medias es el bug
 *  que esto viene a arreglar, no una degradación aceptable. */
export async function listAccounts(
  pedirPagina: PaginaDeCuentas = pedirPaginaDeCuentas,
): Promise<ZohoResult<ZohoAccount[]>> {
  const TAMANO_PAGINA = 200;
  // 10.000 casillas. Es un freno contra un bucle infinito si Zoho devuelve
  // siempre la misma página, no un límite de negocio.
  const TOPE_PAGINAS = 50;

  const todas: ZohoAccount[] = [];
  const vistas = new Set<string>();
  let completa = false;

  for (let pagina = 0; pagina < TOPE_PAGINAS; pagina++) {
    const res = await pedirPagina(pagina * TAMANO_PAGINA, TAMANO_PAGINA);
    if (!res.ok) return res;

    const lote = res.data ?? [];

    // Deduplicar a propósito: la doc de Zoho no aclara si `start` es un
    // desplazamiento (0-based) o un índice (1-based). Con lo segundo las
    // páginas se solapan en una fila. Deduplicar no cuesta nada y deja el
    // recorrido correcto en los dos casos.
    let nuevas = 0;
    for (const a of lote) {
      const clave = String(
        a.accountId ?? a.zuid ?? (a.primaryEmailAddress ?? "").toLowerCase(),
      );
      if (!clave || vistas.has(clave)) continue;
      vistas.add(clave);
      todas.push(a);
      nuevas++;
    }

    // Se acabó: la página vino incompleta, o vino llena pero sin nada nuevo
    // (que es el solape del caso 1-based).
    if (lote.length < TAMANO_PAGINA || nuevas === 0) {
      completa = true;
      break;
    }
  }

  if (!completa) {
    // Truncar en silencio es justo lo que veníamos a eliminar.
    console.error(
      `[zoho] listAccounts cortó en ${todas.length} casillas al llegar al tope de ${TOPE_PAGINAS} páginas`,
    );
  }

  return { ok: true, data: todas };
}

export interface CreateMailboxInput {
  email: string;
  firstName: string;
  lastName: string;
  /** Password inicial. Maven ya genera uno temporal para Supabase Auth;
   *  NO reusar el mismo — son credenciales de sistemas distintos. */
  password: string;
}

/** Crea la casilla. Idempotencia: Zoho rechaza duplicados con su propio
 *  error, no lo enmascaramos — el llamador decide si eso es fatal. */
export function createMailbox(input: CreateMailboxInput): Promise<ZohoResult<ZohoAccount>> {
  // Sin barra final: la doc escribe `/accounts/`, pero con barra el API
  // responde 404. La ruta buena es la misma que usa listAccounts().
  return zohoFetch<ZohoAccount>("/accounts", {
    method: "POST",
    body: JSON.stringify({
      primaryEmailAddress: input.email,
      password: input.password,
      // El apellido es opcional en Maven, pero Zoho lo trata como obligatorio:
      // se le manda el nombre otra vez para que no lo rechace. El displayName
      // —que es lo ÚNICO que ve una persona— se arma con las partes que
      // existan, así un buzón sin apellido no queda como "Capturados
      // Capturados" ni con un espacio colgando al final.
      displayName: [input.firstName, input.lastName].filter(Boolean).join(" "),
      firstName: input.firstName,
      lastName: input.lastName || input.firstName,
    }),
  });
}

/** Suspende la casilla sin borrarla. Es lo que corresponde cuando alguien
 *  deja la empresa: el correo deja de entrar pero el histórico queda. */
export function disableMailbox(accountId: string): Promise<ZohoResult> {
  return zohoFetch(`/accounts/${accountId}`, {
    method: "PUT",
    body: JSON.stringify({ mode: "disableAccount" }),
  });
}

export function enableMailbox(accountId: string): Promise<ZohoResult> {
  return zohoFetch(`/accounts/${accountId}`, {
    method: "PUT",
    body: JSON.stringify({ mode: "enableAccount" }),
  });
}

/** Casillas que Maven NO borra nunca, pase lo que pase.
 *
 *  corp@unlok.me es el Superadministrador de la organización de Zoho: si se
 *  borra, nadie puede volver a administrar Zoho (ni crear casillas, ni
 *  liberar puestos, ni recuperar el correo de nadie). Que alguien la use
 *  como acceso a Maven y después la den de baja no puede llevarse puesta a
 *  la organización entera. */
export const CASILLAS_INTOCABLES: readonly string[] = ["corp@unlok.me"];

export function esCasillaIntocable(email: string): boolean {
  return CASILLAS_INTOCABLES.includes(email.trim().toLowerCase());
}

/** Borra la casilla (y da de baja al usuario de la org) POR EMAIL. Zoho espera
 *  `emailList` (o `accountList` de zuids) en el body — mandar `{accountId}` no
 *  hacía nada. Es la misma operación que "Eliminar usuario" del panel de Zoho,
 *  que libera el puesto. Irreversible — preferir disableMailbox si solo se
 *  quiere suspender.
 *
 *  ⚠️ La guarda de CASILLAS_INTOCABLES vive AQUÍ, en el último paso antes de
 *  Zoho, además de en quien llama: así ningún camino nuevo puede saltársela. */
export function deleteMailbox(email: string): Promise<ZohoResult> {
  if (esCasillaIntocable(email)) {
    return Promise.resolve({
      ok: false,
      error: `${email.trim()} es el Superadministrador de Zoho: Maven nunca la borra`,
    });
  }
  return zohoFetch(`/accounts`, {
    method: "DELETE",
    body: JSON.stringify({ emailList: [email] }),
  });
}

/** Resetea la contraseña de una casilla como admin de la organización.
 *
 *  OJO: la ruta lleva **zuid**, NO accountId. Son identificadores distintos
 *  y Zoho los devuelve juntos en /accounts, así que es fácil pasar el
 *  equivocado y comerse un error opaco.
 *
 *  Es la pieza de recuperación: si la clave de cifrado se pierde o la
 *  conexión de alguien se rompe, Maven genera una contraseña nueva y la
 *  vuelve a guardar cifrada, sin intervención de la persona. */
export function resetMailboxPassword(
  zuid: string | number,
  newPassword: string,
): Promise<ZohoResult> {
  return zohoFetch(`/accounts/${zuid}`, {
    method: "PUT",
    // El `zuid` va en la ruta Y en el cuerpo. Mandarlo solo en la ruta
    // devuelve "zuid is null" — Zoho lo lee del body, no del path.
    body: JSON.stringify({ zuid, mode: "resetPassword", password: newPassword }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GRUPOS (listas de distribución). Un correo al grupo hace fan-out a los
// miembros. NO consumen puesto de usuario (a diferencia de las casillas).
// ⚠️ SCOPE: estas llamadas necesitan `ZohoMail.organization.groups.ALL` en el
// refresh token. El token original se generó para casillas
// (`...accounts.ALL`); si falta el de grupos, Zoho responde OAUTH_SCOPE_MISMATCH
// y hay que regenerar el refresh token agregando ese scope.
// ─────────────────────────────────────────────────────────────────────────────

export interface ZohoGroupMember {
  memberEmailId: string;
  displayName?: string;
  role?: string;
  status?: string;
}
export interface ZohoGroup {
  zgid: string | number;
  emailId: string;
  name: string;
  /** Quién le puede escribir. Ver `setGroupAccess`. */
  accessType?: string;
  mailGroupMemberList?: ZohoGroupMember[];
}

/** Lista los grupos de la organización (con sus miembros). `limit=200` porque
 *  Zoho pagina de a ~10 por defecto y necesitamos TODOS los grupos para que el
 *  sync compare bien (si no, cree que un grupo fuera de la página tiene 0
 *  miembros y re-agrega todo). */
export function listGroups(): Promise<ZohoResult<{ count?: number; groups?: ZohoGroup[] }>> {
  return zohoFetch<{ count?: number; groups?: ZohoGroup[] }>("/groups?limit=200", { method: "GET" });
}

export interface CreateGroupInput {
  emailId: string;
  name: string;
  description?: string;
  /** Public = cualquiera (incl. externos, ej. RH desde Google) puede enviarle.
   *  Organization = solo miembros de la org. Default Public. */
  accessType?: "Public" | "Organization" | "Group" | "Moderated";
  members?: string[];
}
export function createGroup(input: CreateGroupInput): Promise<ZohoResult<ZohoGroup>> {
  return zohoFetch<ZohoGroup>("/groups", {
    method: "POST",
    body: JSON.stringify({
      emailId: input.emailId,
      name: input.name,
      groupDescription: input.description ?? "",
      accessType: input.accessType ?? "Public",
      mailGroupMemberList: (input.members ?? []).map((e) => ({ memberEmailId: e, role: "member" })),
    }),
  });
}

/** Agrega miembros a un grupo existente (mode addMailGroupMember). */
export function addGroupMembers(zgid: string | number, emails: string[]): Promise<ZohoResult> {
  return zohoFetch(`/groups/${zgid}`, {
    method: "PUT",
    body: JSON.stringify({
      mode: "addMailGroupMember",
      mailGroupMemberList: emails.map((e) => ({ memberEmailId: e })),
    }),
  });
}

/** Saca miembros de un grupo (mode deleteMailGroupMember). */
export function removeGroupMembers(zgid: string | number, emails: string[]): Promise<ZohoResult> {
  return zohoFetch(`/groups/${zgid}`, {
    method: "PUT",
    body: JSON.stringify({
      mode: "deleteMailGroupMember",
      mailGroupMemberList: emails.map((e) => ({ memberEmailId: e })),
    }),
  });
}

/** Cambia QUIÉN le puede escribir a un grupo (mode updateMailGroupAdvOptions).
 *
 *  - `Public`       — cualquiera, INCLUIDO internet entero.
 *  - `Organization` — solo quien tenga casilla de la organización.
 *  - `Group`        — solo los miembros del propio grupo.
 *  - `Moderated`    — todo pasa por aprobación de un moderador.
 *
 *  ⚠️ `Public` NO es "público dentro de la empresa": es que `equipo@` acepta
 *  correo de cualquier dirección de internet. Es una vía directa de spam y
 *  phishing a la empresa entera, con el peso extra de venir de una dirección
 *  que todos reconocen como interna.
 *
 *  `holdOrBounce: "hold"` y no `"reject"` a propósito: lo que no pasa el filtro
 *  queda esperando aprobación en vez de rebotar. Si mañana un proveedor legítimo
 *  le escribe a `finanzas@`, alguien puede dejarlo pasar; con `reject` el correo
 *  se pierde y el que lo mandó cree que llegó. */
export function setGroupAccess(
  zgid: string | number,
  accessType: "Public" | "Organization" | "Group" | "Moderated",
): Promise<ZohoResult> {
  return zohoFetch(`/groups/${zgid}`, {
    method: "PUT",
    body: JSON.stringify({
      mode: "updateMailGroupAdvOptions",
      accessType,
      groupAdminSettings: { holdOrBounce: "hold", adminNotify: true },
    }),
  });
}

/** Agrega alias de correo a un grupo (mode addGroupAlias, body aliasList[]).
 *  Los alias son gratis y solo SUMAN direcciones por las que el grupo recibe —
 *  el emailId original sigue funcionando. Caso real: el rol se llama "HHRR" y el
 *  grupo quedó sembrado como rrhh@ → la gente escribía a hhrr@ y rebotaba
 *  (550 5.1.1 Invalid email recipients). Nota: GET /groups NO devuelve los alias,
 *  así que la única confirmación fiable es la respuesta de este PUT. */
export function addGroupAliases(zgid: string | number, aliases: string[]): Promise<ZohoResult> {
  return zohoFetch(`/groups/${zgid}`, {
    method: "PUT",
    body: JSON.stringify({ mode: "addGroupAlias", aliasList: aliases }),
  });
}
