import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, BOT_LIDS } from "../_shared/whatsapp.ts";

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

  let payload: { groups?: Array<{ jid: string; participants: string[]; structured?: Array<{ ids: string[] }> }>; error?: string };
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
    .select("id, external_id, name, tenant_id")
    .eq("active", true)
    .eq("is_direct", false)
    .neq("provider", "manual");

  const porJid = new Map(gwGroups.map((g) => [g.jid, new Set(g.participants)]));
  const estructuradoPorJid = new Map(gwGroups.map((g) => [g.jid, g.structured ?? null]));
  // El propio bot no es un "miembro" del panel (LIDs + su número de línea).
  const BOT_IDS = new Set([...BOT_LIDS.map((l) => `${l}@lid`), "573225218180@s.whatsapp.net"]);
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
    // INSERTAR participantes que el panel no conoce (05/08, caso Grace: entró
    // al grupo pero nunca escribió → el ingest jamás le creó fila y este cron
    // solo tocaba filas existentes → invisible e imposible de vincular).
    // Necesita el campo `structured` del gateway (pares lid/jid POR persona);
    // con el gateway viejo simplemente no inserta (compatible).
    let nuevos = 0;
    const estructurado = estructuradoPorJid.get(String(g.external_id));
    if (estructurado) {
      const conocidos = new Set((miembros ?? []).map((m) => String(m.external_id)));
      for (const p of estructurado) {
        const ids = (p.ids ?? []).map(String);
        if (ids.length === 0) continue;
        if (ids.some((i) => BOT_IDS.has(i))) continue;          // el bot no se lista
        if (ids.some((i) => conocidos.has(i))) continue;        // ya tiene fila (en cualquiera de sus formas)
        // external_id canónico = la forma @lid (la que usa el ingest para los
        // mensajes de grupo); si no hay, el jid con número.
        const lid = ids.find((i) => i.endsWith("@lid"));
        const jid = ids.find((i) => i.endsWith("@s.whatsapp.net"));
        const externalId = lid ?? jid ?? ids[0];
        const { error: insErr } = await sb.from("whatsapp_members").insert({
          tenant_id: g.tenant_id,
          group_id: g.id,
          external_id: externalId,
          // Sin pushName hasta que hable: si hay jid, los dígitos del número
          // al menos permiten reconocerla y vincularla desde el panel.
          display_name: (jid ?? externalId).split("@")[0],
        });
        if (!insErr) { nuevos += 1; conocidos.add(externalId); }
      }
    }
    resumen.push({ grupo: g.name, miembros: (miembros ?? []).length, bajas, altas, nuevos });
  }

  return Response.json({ ok: true, resumen });
});
