import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";
import { runTool } from "../_shared/agent-tools/registry.ts";

// promolog-manager-tick — supervisor PROACTIVO para el grupo de MANAGERS (distinto del
// de closers/LLG). Lee get_promolog_action_feed (las acciones de Promolog del día) y
// arma un mensaje accionable para empujar a las managers a que sus creadoras promocionen.
//
// Estados:
//   - dry_run:true → devuelve el mensaje compuesto SIN mandar (para previsualizar/afinar).
//   - sin PROMOLOG_MANAGER_GROUP_ID seteado → no-op seguro (el grupo de managers todavía
//     no existe; cuando se cree + registre en whatsapp_groups, se setea el env y listo).
//   - normal → manda al grupo via whatsapp-send (misma línea/número del bot).
//
// Las creadoras se referencian con LINK de IG (no @handle) — pedido de Alvaro.

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

// handle / @handle / URL → https://instagram.com/<handle> (link clickeable).
function igLink(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "(sin IG)";
  const m = s.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  const h = (m ? m[1] : s).replace(/^@+/, "").replace(/[/?#].*$/, "").trim();
  return h ? `https://instagram.com/${h}` : "(sin IG)";
}

interface FeedRow {
  kind: string;
  priority: number;
  creator_id: string;
  name: string | null;
  category: string | null;
  instagram_handle: string | null;
  reason: string | null;
}

function compose(feed: FeedRow[]): string | null {
  const tier = feed.filter((r) => r.kind === "tier_sin_promo");
  const onlyIg = feed.filter((r) => r.kind === "solo_ig");
  if (!tier.length && !onlyIg.length) return null;

  const fmt = (r: FeedRow) => `• ${igLink(r.instagram_handle)}${r.category ? ` (${r.category})` : ""}`;
  const capped = (arr: FeedRow[], n: number): string[] =>
    arr.length > n ? [...arr.slice(0, n).map(fmt), `…y ${arr.length - n} más`] : arr.map(fmt);

  const lines: string[] = ["🎯 *Promolog — acciones de hoy*", ""];
  if (tier.length) {
    lines.push(`⚠️ *Tier alto sin promocionar* (${tier.length}) — pedirles promo:`);
    lines.push(...capped(tier, 12), "");
  }
  if (onlyIg.length) {
    lines.push(`📣 *Solo promocionaron en IG* (${onlyIg.length}) — empujar otra red (sube el alcance):`);
    lines.push(...capped(onlyIg, 12), "");
  }
  return lines.join("\n").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({})) as { dry_run?: boolean };
  const dryRun = body?.dry_run === true;

  const sb = adminClient();
  // Vía el catálogo de tools compartido (mismo tool que usará el bot de managers y el orquestador).
  let rows: FeedRow[];
  try {
    rows = (await runTool("get_promolog_action_feed", {}, { sb, tenantId: TENANT_ID })) as FeedRow[];
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
  const message = compose(rows);
  if (!message) return json({ ok: true, sent: false, reason: "nada_que_reportar", count: 0 });

  if (dryRun) return json({ ok: true, dry_run: true, count: rows.length, message });

  const groupId = Deno.env.get("PROMOLOG_MANAGER_GROUP_ID");
  if (!groupId) {
    // El grupo de managers todavía no existe/registrado → no mandamos nada (seguro).
    return json({ ok: true, sent: false, reason: "no_manager_group_configured", count: rows.length, message });
  }

  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Cron-Token": Deno.env.get("CRON_INTERNAL_TOKEN") ?? "" },
    body: JSON.stringify({ group_id: groupId, body: message }),
  });
  const ok = resp.ok;
  return json({ ok, sent: ok, count: rows.length, ...(ok ? {} : { error: `whatsapp-send ${resp.status}` }) });
});
