// ----------------------------------------------------------------------------
// CORS central con ALLOWLIST de orígenes (revisión de seguridad).
//
// Antes casi todas las edge functions respondían `Access-Control-Allow-Origin: *`.
// Ahora: se lee el header Origin de la request y se devuelve ese origin SOLO si
// está en la allowlist; si no está (o no viene), se devuelve el primero de la
// lista (nunca `*`). Siempre con `Vary: Origin` para que los caches no mezclen
// respuestas de orígenes distintos.
//
// Llamadas server-to-server (crons, webhooks, gateway Baileys, agentes) no
// miran estos headers, así que este cambio no las afecta.
// ----------------------------------------------------------------------------

export const ALLOWED_ORIGINS = [
  "https://maven.asmtech.ai",
  "https://maven.asmtech.me",
  "http://localhost:5173", // Vite dev
  "http://localhost:4173", // Vite preview
];

export function pickAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") ?? "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

const DEFAULT_ALLOW_HEADERS = "authorization, x-client-info, apikey, content-type";

// Devuelve los headers CORS para esta request. `extra` permite conservar
// headers adicionales que una función ya tenía (Allow-Methods, Allow-Headers
// ampliados, etc.) sin cambiar nada más que el origin.
export function corsFor(
  req: Request,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": pickAllowedOrigin(req),
    "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
    "Vary": "Origin",
    ...extra,
  };
}
