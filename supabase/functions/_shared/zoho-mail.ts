// OAuth por usuario + API de mensajes de Zoho Mail.
//
// SEPARADO DE `zoho.ts` A PROPÓSITO: son dos credenciales y dos permisos
// distintos que no hay que mezclar.
//
//   zoho.ts       → Self Client, token de ADMIN de la organización.
//                   Crea/suspende/borra casillas. NO puede leer correo.
//   este archivo  → Server-based App, token DE CADA USUARIO.
//                   Lee y envía el correo de esa persona. No administra nada.
//
// El Self Client no sirve acá porque no tiene URL de redirección, y el
// flujo por usuario la necesita.

export interface OAuthResult<T = unknown> {
  ok: boolean;
  skipped?: boolean;
  data?: T;
  error?: string;
  status?: number;
}

interface OAuthEnv {
  clientId: string;
  clientSecret: string;
  dc: string;
}

function readOAuthEnv(): OAuthEnv | null {
  const clientId = Deno.env.get("ZOHO_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get("ZOHO_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, dc: Deno.env.get("ZOHO_DC") ?? "com" };
}

export function oauthConfigured(): boolean {
  return readOAuthEnv() !== null;
}

// Lo mínimo para un cliente de correo funcional. Pedimos de una todo lo
// que el módulo va a necesitar: si después agregamos un scope, cada
// usuario tiene que volver a autorizar, y eso no se le pide dos veces a
// 50 personas.
export const MAIL_SCOPES = [
  "ZohoMail.messages.ALL",
  "ZohoMail.folders.ALL",
  "ZohoMail.accounts.READ",
  "ZohoMail.attachments.ALL",
].join(",");

/** URL a la que mandamos al usuario para que autorice. */
export function buildAuthUrl(state: string, redirectUri: string): string | null {
  const env = readOAuthEnv();
  if (!env) return null;
  const p = new URLSearchParams({
    client_id: env.clientId,
    response_type: "code",
    scope: MAIL_SCOPES,
    redirect_uri: redirectUri,
    // offline = nos devuelve refresh_token. Sin esto solo llega un access
    // token de 1h y habría que pedirle autorización de nuevo cada hora.
    access_type: "offline",
    // Zoho SOLO manda refresh_token la primera vez que el usuario
    // consiente. Si alguien reconecta (cambió de casilla, revocó), sin
    // prompt=consent volvería sin refresh_token y la conexión quedaría
    // inservible en una hora.
    prompt: "consent",
    state,
  });
  return `https://accounts.zoho.${env.dc}/oauth/v2/auth?${p.toString()}`;
}

interface TokenPair {
  refreshToken: string;
  accessToken: string;
}

/** Canjea el `code` del callback por el par de tokens. */
export async function exchangeCode(
  code: string,
  redirectUri: string,
): Promise<OAuthResult<TokenPair>> {
  const env = readOAuthEnv();
  if (!env) return { ok: false, skipped: true, error: "OAuth de Zoho no configurado" };

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.clientId,
    client_secret: env.clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  let resp: Response;
  try {
    resp = await fetch(`https://accounts.zoho.${env.dc}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    return { ok: false, error: `exchange falló: ${(e as Error).message}` };
  }

  const raw = await resp.text();
  let parsed: { access_token?: string; refresh_token?: string; error?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: resp.status, error: `respuesta no-JSON: ${raw.slice(0, 200)}` };
  }

  // Zoho responde 200 con {"error": "..."} cuando el code es inválido o ya
  // se usó. Chequear resp.ok no alcanza.
  if (parsed.error) {
    return { ok: false, status: resp.status, error: `zoho: ${parsed.error}` };
  }
  if (!parsed.refresh_token) {
    // Pasa si el usuario ya había consentido y no mandamos prompt=consent.
    return {
      ok: false,
      status: resp.status,
      error: "Zoho no devolvió refresh_token — hay que volver a autorizar con prompt=consent",
    };
  }
  return {
    ok: true,
    data: { refreshToken: parsed.refresh_token, accessToken: parsed.access_token ?? "" },
  };
}

/** Access token nuevo a partir del refresh token guardado del usuario. */
export async function refreshUserToken(refreshToken: string): Promise<OAuthResult<string>> {
  const env = readOAuthEnv();
  if (!env) return { ok: false, skipped: true, error: "OAuth de Zoho no configurado" };

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.clientId,
    client_secret: env.clientSecret,
    refresh_token: refreshToken,
  });

  let resp: Response;
  try {
    resp = await fetch(`https://accounts.zoho.${env.dc}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (e) {
    return { ok: false, error: `refresh falló: ${(e as Error).message}` };
  }

  const raw = await resp.text();
  let parsed: { access_token?: string; error?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: resp.status, error: `respuesta no-JSON: ${raw.slice(0, 200)}` };
  }
  if (!parsed.access_token) {
    return { ok: false, status: resp.status, error: `zoho: ${parsed.error ?? raw.slice(0, 200)}` };
  }
  return { ok: true, data: parsed.access_token };
}

export interface ZohoMailAccount {
  accountId?: string;
  primaryEmailAddress?: string;
  displayName?: string;
}

/** Casillas del usuario dueño del token. Necesitamos el `accountId`:
 *  todas las llamadas de mensajes cuelgan de `/accounts/{accountId}/...`. */
export async function getMyAccounts(accessToken: string): Promise<OAuthResult<ZohoMailAccount[]>> {
  const env = readOAuthEnv();
  if (!env) return { ok: false, skipped: true, error: "OAuth de Zoho no configurado" };

  let resp: Response;
  try {
    resp = await fetch(`https://mail.zoho.${env.dc}/api/accounts`, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    });
  } catch (e) {
    return { ok: false, error: `accounts falló: ${(e as Error).message}` };
  }

  const raw = await resp.text();
  let parsed: {
    data?: ZohoMailAccount[] & { errorCode?: string; moreInfo?: string };
    status?: { code?: number; description?: string };
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, status: resp.status, error: `respuesta no-JSON: ${raw.slice(0, 200)}` };
  }

  // Igual que en zoho.ts: el motivo real está en data.errorCode/moreInfo,
  // NO en status.description (que siempre dice "Invalid Input").
  const d = parsed.data as unknown as { errorCode?: string; moreInfo?: string } | undefined;
  if (!resp.ok || d?.errorCode) {
    const parts = [d?.errorCode, d?.moreInfo, parsed.status?.description].filter(Boolean);
    return {
      ok: false,
      status: parsed.status?.code ?? resp.status,
      error: parts.length ? parts.join(" — ") : raw.slice(0, 300),
    };
  }
  return { ok: true, data: (parsed.data ?? []) as ZohoMailAccount[] };
}
