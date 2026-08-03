import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt } from "../_shared/whatsapp.ts";

// whatsapp-corte-tick — el EJECUTOR del régimen de cortes cada 2h de Álvaro
// (03/08). Sin esto, el bot "prometía" cortes que nadie disparaba (contentillo
// estructural: reglas guardadas, cero ejecución).
//
// Qué hace en cada corte (9·11·13·15·17 Bogotá) y en el cierre (19):
//   1. Invoca al agente en CADA grupo operativo con invoked_by="corte_2h" (o
//      "corte_cierre" a las 19): el agente compone el resumen con lo que el
//      equipo fue contando y lo publica en el grupo. SIN Hubstaff (privacidad:
//      los grupos son del equipo; la productividad es dato del jefe).
//   2. Espera los 3 cortes publicados (poll ~100s) y arma la COPIA para el DM
//      de Álvaro: los 3 textos + bloque Hubstaff (RPC corte_hubstaff_bloque),
//      que va SOLO acá.
//   3. La manda por whatsapp-send.
//
// Domingo no corre (mismo criterio que el pulso: solo 12/18 sin control de
// gente). `?force=true` saltea el gate de hora para pruebas manuales.

const GRUPOS: Array<{ id: string; nombre: string }> = [
  { id: "a12d9f41-c962-4d98-b0bb-6b2d2573534c", nombre: "AI WARMING" },
  { id: "73a4414e-2546-4ca7-9289-7cbec70b0273", nombre: "MANAGERS" },
  { id: "d12ec56f-b324-4369-b72d-7540fb930ef6", nombre: "VENTAS" },
];
const DM_ALVARO = "9eb0f764-cf6e-4d8f-87e0-c7b9cdc2d17f";
const HORAS_CORTE = new Set([9, 11, 13, 15, 17]);
const HORA_CIERRE = 19;
const POLL_MAX_MS = 100_000;

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

function horaBogota(): { hora: number; dow: number; hhmm: string } {
  const bog = new Date(Date.now() - 5 * 3600_000);
  return {
    hora: bog.getUTCHours(),
    dow: bog.getUTCDay(),
    hhmm: `${bog.getUTCHours()}:${String(bog.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function fireAgente(groupId: string, messageId: string | null, invokedBy: string): void {
  fetch(`${PROJECT_URL}/functions/v1/whatsapp-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Cron-Token": CRON_TOKEN },
    body: JSON.stringify({ message_id: messageId, group_id: groupId, invoked_by: invokedBy }),
  }).catch((e) => console.warn("fireAgente falló:", groupId, (e as Error).message));
}

serve(async (req) => {
  // authorizeCronOrJwt devuelve BOOLEAN (no {ok}) — el estreno de las 17:00
  // (03/08) murió en 401 por tratarlo como objeto: true.ok === undefined.
  if (!authorizeCronOrJwt(req)) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const { hora, dow, hhmm } = horaBogota();

  if (!force) {
    if (dow === 0) return Response.json({ skip: "domingo" });
    if (!HORAS_CORTE.has(hora) && hora !== HORA_CIERRE) {
      return Response.json({ skip: `hora ${hora} no es de corte` });
    }
  }
  const esCierre = hora === HORA_CIERRE;
  const invokedBy = esCierre ? "corte_cierre" : "corte_2h";
  const sb = adminClient();
  const inicio = new Date().toISOString();

  // 1. Disparar el agente en cada grupo, con CANDADO por franja (03/08: doble
  //    corte a las 17:00 — Álvaro lo pidió por mención y el tick manual entró
  //    4 min después). Quien inserta el claim publica; duplicado → se saltea.
  //    El message_id es solo un ANCLA (el modo corte arma su propia ventana).
  const hoyBog = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const disparados: string[] = [];
  for (const g of GRUPOS) {
    const { data: claim } = await sb
      .from("corte_claims")
      .upsert({ fecha: hoyBog, hora, group_id: g.id }, {
        onConflict: "fecha,hora,group_id",
        ignoreDuplicates: true,
      })
      .select("group_id");
    if (!claim || claim.length === 0) {
      console.warn(`corte ${hora} ya reclamado para ${g.nombre} — no se duplica`);
      continue;
    }
    const { data: ultimo } = await sb
      .from("whatsapp_messages")
      .select("id")
      .eq("group_id", g.id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fireAgente(g.id, ultimo?.id ?? null, invokedBy);
    disparados.push(g.id);
    // Escalonar 2s: tres corridas simultáneas compiten por Anthropic y el lock global.
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (disparados.length === 0) {
    return Response.json({ ok: true, modo: invokedBy, skip: "todos los grupos ya tenían corte reclamado en esta franja" });
  }

  // 2. Esperar los cortes publicados (uno por grupo) hasta POLL_MAX_MS.
  const textos = new Map<string, string>();
  const deadline = Date.now() + POLL_MAX_MS;
  while (Date.now() < deadline && textos.size < GRUPOS.length) {
    await new Promise((r) => setTimeout(r, 5000));
    for (const g of GRUPOS) {
      if (textos.has(g.id)) continue;
      const { data: post } = await sb
        .from("whatsapp_messages")
        .select("body")
        .eq("group_id", g.id)
        .eq("is_from_bot", true)
        .gt("sent_at", inicio)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (post?.body) textos.set(g.id, String(post.body));
    }
  }

  // 3. Bloque Hubstaff (SOLO para el DM del jefe — jamás a los grupos).
  let hubstaff = "(sin datos de Hubstaff)";
  const { data: hs, error: hsErr } = await sb.rpc("corte_hubstaff_bloque");
  if (!hsErr && hs) hubstaff = String(hs);

  // 4. Copia al DM de Álvaro.
  const partes: string[] = [
    esCierre ? `📋 *CIERRE DEL DÍA* — ${hhmm} (copia directa)` : `📋 *CORTE ${hhmm}* (copia directa)`,
  ];
  for (const g of GRUPOS) {
    partes.push(`\n— *${g.nombre}* —\n${textos.get(g.id) ?? "⚠️ el corte de este grupo no llegó a publicarse (revisar)"}`);
  }
  partes.push(`\n🕐 *Hubstaff ahora* (solo para ti)\n${hubstaff}`);

  const r = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${ANON_KEY}`,
      "X-Cron-Token": CRON_TOKEN,
    },
    body: JSON.stringify({ group_id: DM_ALVARO, body: partes.join("\n") }),
  });

  return Response.json({
    ok: true,
    modo: invokedBy,
    cortes_publicados: textos.size,
    dm_enviado: r.ok,
  });
});
