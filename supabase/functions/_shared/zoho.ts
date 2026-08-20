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

/** Lista las casillas de la organización. Sirve de smoke test: si esto
 *  anda, las credenciales y el zoid están bien. */
export function listAccounts(): Promise<ZohoResult<ZohoAccount[]>> {
  return zohoFetch<ZohoAccount[]>("/accounts", { method: "GET" });
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
      displayName: `${input.firstName} ${input.lastName}`,
      firstName: input.firstName,
      lastName: input.lastName,
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

/** Borra la casilla y su contenido. Irreversible — preferir disableMailbox. */
export function deleteMailbox(accountId: string): Promise<ZohoResult> {
  return zohoFetch(`/accounts`, {
    method: "DELETE",
    body: JSON.stringify({ accountId }),
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
