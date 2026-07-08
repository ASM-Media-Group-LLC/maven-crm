import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";

// promolog-manager-tick — SUPERVISOR PROACTIVO del grupo de MANAGERS (agente distinto
// del whatsapp-agent de closers/LLG que vive en Marketing/Ventas).
//
// Cerebro: get_manager_growth_feed cruza PROMOCIÓN (Promolog 14d, respetando #818) ×
// INGRESO (creator_daily_earnings, 7d vs 7d previos) por modelo ACTIVA y la ubica en un
// cuadrante accionable. Agrupa por la manager responsable y arma un mensaje que:
//   - le hace @-mención real a cada manager con SUS modelos en alerta,
//   - separa 🔴 no-crece+no-promociona / 🟠 promociona-pero-cae(calidad) / 🟡 riesgo,
//   - @-menciona a Lorena (estrategia promocional transversal) si hay modelos que no crecen.
//
// Modos:
//   - dry_run:true → devuelve el mensaje compuesto SIN mandar (previsualizar/afinar umbrales).
//   - MANAGER_SUPERVISOR_LIVE != "1"/"true" → compone pero NO manda (reason:"not_live_yet").
//     Es el switch de seguridad: hasta que no se prenda, el cron diario no spammea al grupo.
//   - live → manda al grupo de managers via whatsapp-send (misma línea/número del bot).
//
// Umbrales afinables por body: { promo_window, low_promo_days, income_drop_pct }.

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
// JID estable del grupo "Managers" (fallback si no está seteado PROMOLOG_MANAGER_GROUP_ID).
const MANAGERS_GROUP_JID = "120363408785575383@g.us";
// Profile id de Lorena (estrategia promocional transversal, no tiene modelos asignadas).
const LORENA_PROFILE_ID = "bf9c58cc-0675-4d9f-9d02-962e756d2f35";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

interface GrowthRow {
  creator_id: string;
  name: string | null;
  instagram_handle: string | null;
  category: string | null;
  manager_profile_id: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  promo_days: number;
  covered_days: number;
  income_7d: number;
  income_prev7d: number;
  income_trend_pct: number | null;
  quadrant: string; // critico | calidad | riesgo
  priority: number;
  diagnosis: string;
}

// +573012282569 → "573012282569" (token de @-mención sin el "+", y base del JID).
const phoneToken = (e164: string | null | undefined): string =>
  String(e164 ?? "").replace(/[^\d]/g, "");
const jidOf = (e164: string | null | undefined): string => `${phoneToken(e164)}@s.whatsapp.net`;
const firstName = (full: string | null | undefined): string =>
  String(full ?? "manager").trim().split(/\s+/)[0] || "manager";

function money(n: number): string {
  const v = Math.round(n);
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v}`;
}
function trendStr(t: number | null): string {
  if (t === null || t === undefined) return "s/d";
  return `${t > 0 ? "+" : ""}${t}%`;
}
// handle → https://instagram.com/<handle> (clickeable en WhatsApp). "" si no hay.
function igUrl(handle: string | null | undefined): string {
  const h = String(handle ?? "").replace(/^@+/, "").replace(/instagram\.com\//i, "").replace(/[/?#].*$/, "").trim();
  return h ? `https://instagram.com/${h}` : "";
}

const RIESGO_CAP = 3; // por manager, para no hacer el mensaje eterno

interface Composed {
  message: string | null;
  mentions: string[];
  counts: { total: number; critico: number; calidad: number; riesgo: number; managers: number };
}

function compose(rows: GrowthRow[], lorenaPhone: string | null, promoWindow: number): Composed {
  const mentions = new Set<string>();
  const bullet = (r: GrowthRow) => {
    const link = igUrl(r.instagram_handle);
    const label = link ? `${r.name ?? r.instagram_handle} — ${link}` : (r.name ?? "?");
    return `   • ${label}\n     promo ${r.promo_days}/${promoWindow} · ingreso ${trendStr(r.income_trend_pct)} (${money(r.income_7d)})`;
  };

  // Agrupar por manager preservando el orden del feed (ya viene por prioridad + ingreso desc).
  const order: string[] = [];
  const byMgr = new Map<string, GrowthRow[]>();
  for (const r of rows) {
    const k = r.manager_profile_id ?? "sin_manager";
    if (!byMgr.has(k)) { byMgr.set(k, []); order.push(k); }
    byMgr.get(k)!.push(r);
  }

  const critTotal = rows.filter((r) => r.quadrant === "critico").length;
  const calTotal = rows.filter((r) => r.quadrant === "calidad").length;
  const riesgoTotal = rows.filter((r) => r.quadrant === "riesgo").length;
  if (!rows.length) {
    return { message: null, mentions: [], counts: { total: 0, critico: 0, calidad: 0, riesgo: 0, managers: 0 } };
  }

  const lines: string[] = [
    `🎯 *Supervisión de crecimiento* — ${rows.length} modelos necesitan atención`,
    `_Promoción × ingresos, últimos ${promoWindow} días_`,
    "",
  ];

  for (const k of order) {
    const g = byMgr.get(k)!;
    const mgrName = firstName(g[0].manager_name);
    const mgrPhone = g[0].manager_phone;
    const tag = mgrPhone ? `@${phoneToken(mgrPhone)}` : mgrName;
    if (mgrPhone) mentions.add(jidOf(mgrPhone));

    lines.push(`👤 ${tag} *${mgrName}* — ${g.length} en alerta`);

    const crit = g.filter((r) => r.quadrant === "critico");
    const cal = g.filter((r) => r.quadrant === "calidad");
    const rie = g.filter((r) => r.quadrant === "riesgo");

    if (crit.length) {
      lines.push(`🔴 No crece + no promociona (${crit.length}):`);
      lines.push(...crit.map(bullet));
    }
    if (cal.length) {
      lines.push(`🟠 Promociona pero cae — revisar calidad (${cal.length}):`);
      lines.push(...cal.map(bullet));
    }
    if (rie.length) {
      lines.push(`🟡 Riesgo, súbele promo (${rie.length}):`);
      lines.push(...rie.slice(0, RIESGO_CAP).map(bullet));
      if (rie.length > RIESGO_CAP) lines.push(`   • …y ${rie.length - RIESGO_CAP} más`);
    }
    lines.push("");
  }

  // Lorena = estrategia promocional transversal. La sumamos si hay modelos que NO crecen
  // (ingreso cae): critico + calidad. Ahí es donde su ayuda de estrategia mueve la aguja.
  const noGrow = critTotal + calTotal;
  if (noGrow > 0 && lorenaPhone) {
    lines.push(
      `📊 @${phoneToken(lorenaPhone)} *${firstName("Lorena")}* — ${noGrow} modelos con ingreso a la baja esta semana; vale revisar estrategia de promoción.`,
    );
    mentions.add(jidOf(lorenaPhone));
  }

  return {
    message: lines.join("\n").trim(),
    mentions: [...mentions],
    counts: { total: rows.length, critico: critTotal, calidad: calTotal, riesgo: riesgoTotal, managers: order.length },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as {
    dry_run?: boolean;
    promo_window?: number;
    low_promo_days?: number;
    income_drop_pct?: number;
  };
  const dryRun = body?.dry_run === true;
  const promoWindow = Number(body?.promo_window ?? 14);

  const sb = adminClient();

  // Cerebro.
  const { data: feed, error: feedErr } = await sb.rpc("get_manager_growth_feed", {
    p_tenant: TENANT_ID,
    p_promo_window: promoWindow,
    p_low_promo_days: Number(body?.low_promo_days ?? 4),
    p_income_drop_pct: Number(body?.income_drop_pct ?? 15),
  });
  if (feedErr) return json({ ok: false, error: feedErr.message }, 500);
  const rows = (feed ?? []) as GrowthRow[];

  // Teléfono de Lorena (perfil estable, teléfono actual).
  let lorenaPhone: string | null = null;
  {
    const { data: lp } = await sb.from("profiles").select("phone_e164").eq("id", LORENA_PROFILE_ID).maybeSingle();
    lorenaPhone = lp?.phone_e164 ?? null;
  }

  const { message, mentions, counts } = compose(rows, lorenaPhone, promoWindow);
  if (!message) return json({ ok: true, sent: false, reason: "nada_que_reportar", counts });

  if (dryRun) return json({ ok: true, dry_run: true, counts, mentions, message });

  // Switch de seguridad: no manda hasta prenderlo. Se controla por env
  // MANAGER_SUPERVISOR_LIVE o por el flag DB app_flags('manager_supervisor_live')
  // (togglable por SQL sin redeploy).
  let live = ["1", "true", "yes"].includes((Deno.env.get("MANAGER_SUPERVISOR_LIVE") ?? "").toLowerCase());
  if (!live) {
    const { data: flag } = await sb.from("app_flags").select("enabled").eq("key", "manager_supervisor_live").maybeSingle();
    live = flag?.enabled === true;
  }
  if (!live) return json({ ok: true, sent: false, reason: "not_live_yet", counts, mentions, message });

  // Resolver el UUID del grupo (env override, si no por el JID estable).
  let groupId = Deno.env.get("PROMOLOG_MANAGER_GROUP_ID") ?? "";
  if (!groupId) {
    const { data: grp } = await sb
      .from("whatsapp_groups")
      .select("id")
      .eq("external_id", MANAGERS_GROUP_JID)
      .maybeSingle();
    groupId = grp?.id ?? "";
  }
  if (!groupId) return json({ ok: true, sent: false, reason: "no_manager_group_configured", counts, message });

  const resp = await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Cron-Token": Deno.env.get("CRON_INTERNAL_TOKEN") ?? "" },
    body: JSON.stringify({ group_id: groupId, body: message, mentions }),
  });
  const ok = resp.ok;
  return json({ ok, sent: ok, counts, ...(ok ? {} : { error: `whatsapp-send ${resp.status}` }) });
});
