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
  // Dominio propio de la empresa. Se AGREGA sin quitar el viejo: los links
  // públicos ya enviados (candidatos del evaluador, invitados de Meet,
  // grabaciones por correo) apuntan a maven.asmtech.ai y tienen que seguir
  // funcionando para siempre.
  //
  // `app` es el CANÓNICO (ver lib/dominioCanonico.ts); los otros dos redirigen
  // ahí, pero quedan permitidos por si alguien llega con una sesión a medias.
  "https://app.maven-ai.me",
  "https://www.maven-ai.me",
  "https://maven-ai.me",
  "http://localhost:5173", // Vite dev (puerto por defecto de Vite)
  // El dev server de Maven corre en 8080 (ver .claude/launch.json y el PORT del
  // vite.config). Sin este origen, desde el dev local las edge functions
  // negaban TODO lo de cowork: el Hub moría con "Failed to fetch" y los
  // previews de sala con "Preview no disponible" — el error de conexión que
  // Alvaro veía una y otra vez en el panel (10/2026).
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  // La vista local de revisión corre en 8081 cuando otra sesión ocupa el 8080
  // (18/11/2026: «Salas en vivo» decía «No se pudo leer» solo por esto).
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:4173", // Vite preview
  // El preview por IP: pwa.ts no registra el service worker cuando el host es
  // "localhost", así que para probar push en local el build se abre en
  // 127.0.0.1:4173 — y sin este origen la edge le negaba hasta la public key.
  "http://127.0.0.1:4173",
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
