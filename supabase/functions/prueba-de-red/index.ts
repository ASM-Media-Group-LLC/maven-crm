// PRUEBA DE VELOCIDAD DE LA LLAMADA (Alvaro, 13/11/2026).
//
// Los números de «internet» que había no servían para decir si alguien tiene
// buena conexión: `subida_kbps` era el availableOutgoingBitrate de WebRTC (lo que
// la llamada está usando según su control de congestión, no lo que el internet
// aguanta; hay muestras de 1.000.000 kbps) y las barritas del mosaico son la
// calidad de la llamada de LiveKit, no la velocidad.
//
// Esta función es el otro extremo de una prueba de verdad que hace el navegador
// al entrar a una sala de Cowork y cada ~30 min (frontend/src/lib/pruebaDeRed.ts):
//
//   GET  ?bytes=N  → N bytes al azar (tope 2 MB). Con N=0, un 204: sirve de ping.
//   POST (cuerpo)  → lee el cuerpo entero, lo descarta y contesta 204 (tope 3 MB).
//
// El navegador cronometra cada una y calcula los Mbps. Aquí no se guarda nada:
// el resultado viaja en la muestra de llamada_salud de esa persona.
//
// Por qué al azar: unos bytes repetidos (o ceros) se comprimen en el camino y la
// bajada saldría absurdamente rápida. El bloque se arma UNA vez por instancia.
//
// Seguridad: verify_jwt = true en config.toml (el gateway exige un JWT válido) y,
// además, aquí se revive al usuario con ese JWT: solo una sesión de Maven puede
// usarla. La verificación se recuerda unos minutos por token para que las tres
// peticiones de una prueba no paguen tres viajes a Auth (eso ensuciaría la medida).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";

const MAX_BAJADA = 2_000_000;
const BAJADA_POR_DEFECTO = 1_500_000;
const MAX_SUBIDA = 3_000_000;
const RECORDAR_TOKEN_MS = 5 * 60_000;
const MAX_TOKENS_RECORDADOS = 1_000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const verificados = new Map<string, number>();

async function hayUsuario(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const ahora = Date.now();
  const hasta = verificados.get(token);
  if (hasta && hasta > ahora) return true;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return false;
  if (verificados.size >= MAX_TOKENS_RECORDADOS) verificados.clear();
  verificados.set(token, ahora + RECORDAR_TOKEN_MS);
  return true;
}

let bloque: Uint8Array | null = null;
function bytesAlAzar(): Uint8Array {
  if (!bloque) {
    bloque = new Uint8Array(MAX_BAJADA);
    // getRandomValues llena como mucho 65.536 bytes por llamada.
    for (let i = 0; i < bloque.length; i += 65_536) {
      crypto.getRandomValues(bloque.subarray(i, Math.min(i + 65_536, bloque.length)));
    }
  }
  return bloque;
}

function bytesPedidos(url: string): number {
  const crudo = new URL(url).searchParams.get("bytes");
  const n = crudo === null ? BAJADA_POR_DEFECTO : Number(crudo);
  if (!Number.isFinite(n)) return BAJADA_POR_DEFECTO;
  return Math.max(0, Math.min(MAX_BAJADA, Math.floor(n)));
}

Deno.serve(async (req) => {
  const cors = corsFor(req, {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // El preflight se recuerda un día: si no, cada parte de la prueba pagaría
    // un viaje de más y la medida saldría peor de lo que es.
    "Access-Control-Max-Age": "86400",
  });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sinCache = { ...cors, "Cache-Control": "no-store" };

  if (!(await hayUsuario(req))) {
    return new Response(JSON.stringify({ error: "sin sesión" }), {
      status: 401,
      headers: { ...sinCache, "Content-Type": "application/json" },
    });
  }

  if (req.method === "GET") {
    const n = bytesPedidos(req.url);
    if (n === 0) return new Response(null, { status: 204, headers: sinCache });
    return new Response(bytesAlAzar().subarray(0, n), {
      status: 200,
      headers: { ...sinCache, "Content-Type": "application/octet-stream", "Content-Length": String(n) },
    });
  }

  if (req.method === "POST") {
    // Se lee hasta el final (si no, la subida no terminaría de medirse) y se tira.
    let total = 0;
    const lector = req.body?.getReader();
    if (lector) {
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_SUBIDA) {
          await lector.cancel().catch(() => {});
          return new Response(JSON.stringify({ error: "demasiado grande" }), {
            status: 413,
            headers: { ...sinCache, "Content-Type": "application/json" },
          });
        }
      }
    }
    return new Response(null, { status: 204, headers: sinCache });
  }

  return new Response(JSON.stringify({ error: "método no permitido" }), {
    status: 405,
    headers: { ...sinCache, "Content-Type": "application/json" },
  });
});
