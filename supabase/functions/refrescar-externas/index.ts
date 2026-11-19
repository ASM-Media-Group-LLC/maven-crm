// REFRESCAR-EXTERNAS — solo en el EDIFICIO (maven-agencias). La despierta un reloj cada
// 15 min (infra/edificio/migraciones/20261120090000_cobros.sql) con X-Cron-Token.
//
// Le pide a Kash su resumen de SOLO LECTURA (función kash-resumen, con la llave dedicada
// KASH_RESUMEN_TOKEN) y lo guarda en organizaciones_externas (fuente = 'kash'): la
// tarjeta «solo mirar» del panel del dueño. Aquí no hay nada que escriba en Kash.
//
// Secretos del edificio: CRON_INTERNAL_TOKEN (ya está), KASH_RESUMEN_TOKEN (el mismo valor
// que se pone en Kash) y, opcional, KASH_RESUMEN_URL y KASH_APP_URL.
// verify_jwt = false (config.toml): la llama el reloj, no una sesión.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { tokenDeCronValido } from "../_shared/cron-token.ts";
import { juntarResumen } from "./logica.ts";

const json = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

// La función de Kash (la dirección pública de sus funciones; se puede cambiar con KASH_RESUMEN_URL).
const URL_KASH = "https://lsagslbkliprespbyhts.supabase.co/functions/v1/kash-resumen";

Deno.serve(async (req) => {
  if (!(await tokenDeCronValido(req.headers.get("x-cron-token"), Deno.env.get("CRON_INTERNAL_TOKEN")))) {
    return json({ error: "no_autorizado" }, 401);
  }
  const llave = Deno.env.get("KASH_RESUMEN_TOKEN");
  if (!llave) return json({ ok: false, error: "falta KASH_RESUMEN_TOKEN" }, 503);

  let resumen: Record<string, unknown>;
  try {
    const res = await fetch(Deno.env.get("KASH_RESUMEN_URL") || URL_KASH, {
      method: "GET",
      headers: { "X-Kash-Resumen-Token": llave },
      signal: AbortSignal.timeout(25_000),
    });
    const cuerpo = await res.json().catch(() => null) as { ok?: boolean; resumen?: Record<string, unknown> } | null;
    if (!res.ok || !cuerpo?.ok || !cuerpo.resumen) return json({ ok: false, error: `kash respondió ${res.status}` }, 502);
    resumen = cuerpo.resumen;
  } catch (e) {
    return json({ ok: false, error: `kash no respondió: ${(e as Error).message}` }, 502);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: fila, error: errLeer } = await db.from("organizaciones_externas").select("id, resumen").eq("fuente", "kash").maybeSingle();
  if (errLeer) return json({ ok: false, error: errLeer.message }, 500);
  const ahora = new Date();
  const nuevo = juntarResumen((fila as { resumen?: Record<string, unknown> } | null)?.resumen ?? null, resumen, ahora);
  const { error } = fila
    ? await db.from("organizaciones_externas").update({ resumen: nuevo, actualizado_at: ahora.toISOString() }).eq("id", (fila as { id: string }).id)
    // La primera vez nace con su nombre y el botón «Entrar» (el dueño los puede cambiar después).
    : await db.from("organizaciones_externas").insert({
      fuente: "kash", nombre: "Kash", app_url: Deno.env.get("KASH_APP_URL") || "https://app.maven-ai.me",
      resumen: nuevo, actualizado_at: ahora.toISOString(),
    });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
});
