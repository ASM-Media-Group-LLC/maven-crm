// LA PUERTA — directorio público del EDIFICIO (maven-agencias, ezeigddgkaemxpshghmu).
// Solo en el edificio (infra/casas/funciones-solo-edificio.txt); Kash no la tiene.
//
// app.maven-ai.me pregunta el correo antes de la contraseña. Si la puerta está prendida
// (VITE_PUERTA_EDIFICIO=1), la app le pregunta a esta función «¿este correo vive en el
// edificio?» y manda a la persona a Kash (lo de siempre) o al edificio.
//
// Responde SOLO {edificio: true|false}: nada de nombres, empresas ni si la cuenta está
// activa. Tope por IP (puerta_contar: 30 cada 10 min) para que no sirva para barrer
// correos. verify_jwt = false (config.toml): quien pregunta todavía no entró.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsFor } from "../_shared/cors.ts";

const cors = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" });

const responder = (req: Request, cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const TOPE_POR_IP = 30;
export const VENTANA_MIN = 10;

export function correoValido(c: unknown): string | null {
  if (typeof c !== "string") return null;
  const v = c.trim().toLowerCase();
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? v : null;
}

async function huella(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    if (req.method !== "POST") return responder(req, { error: "metodo" }, 405);
    const b = (await req.json().catch(() => ({}))) as { correo?: unknown };
    const correo = correoValido(b.correo);
    if (!correo) return responder(req, { error: "correo_invalido" }, 400);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
    const { data: puede, error: errTope } = await db.rpc("puerta_contar", {
      _clave: `directorio:${await huella(ip)}`, _tope: TOPE_POR_IP, _minutos: VENTANA_MIN,
    });
    if (errTope) {
      console.error("[directorio] tope:", errTope.message);
      return responder(req, { error: "no_disponible" }, 503);
    }
    if (puede !== true) return responder(req, { error: "demasiados_intentos" }, 429);

    const { data, error } = await db.rpc("directorio_es_del_edificio", { _correo: correo });
    // Un fallo NO es «no está»: la app sigue a Kash (lo de siempre) y lo dice el error.
    if (error) {
      console.error("[directorio]", error.message);
      return responder(req, { error: "no_disponible" }, 503);
    }
    return responder(req, { edificio: data === true });
  });
}
