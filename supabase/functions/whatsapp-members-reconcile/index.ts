import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt } from "../_shared/whatsapp.ts";

// whatsapp-members-reconcile — sincroniza whatsapp_members.active contra los
// participantes REALES que reporta el gateway (Baileys).
//
// Por qué (03/08): el gateway no procesa las SALIDAS de grupo — Lizeth salió de
// Ventas y Lorena de Managers y sus filas quedaron active=true: el bot las
// siguió sugiriendo para tareas y los cortes/notas las siguieron contando.
// Este cron (1×/hora) marca active=false a quien ya no está y active=true a
// quien volvió. Solo toca grupos que el gateway CONOCE (la línea principal);
// los demás quedan como están.
//
// Guardas:
//  · Lista de participantes sospechosamente chica (<3) → se saltea el grupo
//    (un glitch del gateway no puede desactivar a todo el mundo).
//  · Gateway sin el endpoint todavía (404, hasta el redeploy de Dokploy) o
//    caído → no-op limpio, con nota en la respuesta.

const GATEWAY_URL = (Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "").replace(/\/$/, "");
const GATEWAY_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";

serve(async (req) => {
  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  if (!GATEWAY_URL || !GATEWAY_KEY) return Response.json({ skip: "gateway_no_configurado" });

  let payload: { groups?: Array<{ jid: string; participants: string[] }>; error?: string };
  try {
    const r = await fetch(`${GATEWAY_URL}/groups/participants`, {
      headers: { "apikey": GATEWAY_KEY },
      signal: AbortSignal.timeout(20_000),
    });
    if (r.status === 404) return Response.json({ skip: "endpoint_no_deployado_aun (redeploy del gateway pendiente)" });
    if (!r.ok) return Response.json({ skip: `gateway ${r.status}` });
    payload = await r.json();
  } catch (e) {
    return Response.json({ skip: `gateway_inalcanzable: ${(e as Error).message}` });
  }
  const gwGroups = payload.groups ?? [];
  if (gwGroups.length === 0) return Response.json({ skip: payload.error ?? "sin_grupos_del_gateway" });

  const sb = adminClient();
  const { data: grupos } = await sb
    .from("whatsapp_groups")
    .select("id, external_id, name")
    .eq("active", true)
    .eq("is_direct", false)
    .neq("provider", "manual");

  const porJid = new Map(gwGroups.map((g) => [g.jid, new Set(g.participants)]));
  const resumen: Array<Record<string, unknown>> = [];

  for (const g of grupos ?? []) {
    const participantes = porJid.get(String(g.external_id));
    if (!participantes) continue;                      // grupo de otra línea — no tocar
    if (participantes.size < 3) {                      // lista sospechosa — no tocar
      resumen.push({ grupo: g.name, skip: "participantes<3" });
      continue;
    }
    const { data: miembros } = await sb
      .from("whatsapp_members")
      .select("id, external_id, display_name, active")
      .eq("group_id", g.id);

    let bajas = 0, altas = 0;
    for (const m of miembros ?? []) {
      const presente = participantes.has(String(m.external_id));
      if (m.active && !presente) {
        await sb.from("whatsapp_members").update({ active: false }).eq("id", m.id);
        bajas += 1;
      } else if (!m.active && presente) {
        await sb.from("whatsapp_members").update({ active: true }).eq("id", m.id);
        altas += 1;
      }
    }
    resumen.push({ grupo: g.name, miembros: (miembros ?? []).length, bajas, altas });
  }

  return Response.json({ ok: true, resumen });
});
