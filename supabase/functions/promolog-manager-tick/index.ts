import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";

// promolog-manager-tick — SUPERVISOR PROACTIVO del grupo de MANAGERS (agente distinto
// del whatsapp-agent de closers/LLG que vive en Marketing/Ventas).
//
// Cerebro: get_manager_growth_feed cruza PROMOCIÓN (Promolog mes a la fecha, respetando #818) ×
// INGRESO (creator_daily_earnings, mes a la fecha vs mismo día del mes pasado) por modelo ACTIVA y la ubica en un
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
  income_mtd: number;
  income_prev_mtd: number;
  income_trend_pct: number | null;
  mtd_day?: number;
  quadrant: string; // critico | calidad | riesgo
  priority: number;
  diagnosis: string;
}

// Señal de "contacto": creadora a la que la manager no le escribe hace >= N días
// POR LA LÍNEA de las Managers Y que además no promociona (get_manager_silent_no_promo).
interface SilentRow {
  creator_id: string;
  name: string | null;
  instagram_handle: string | null;
  manager_profile_id: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  promo_days: number;
  mtd_day: number;
  days_since_contact: number;
  last_contact_at: string | null;
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
  counts: { total: number; critico: number; calidad: number; riesgo: number; silent: number; managers: number };
}

function compose(rows: GrowthRow[], silentRows: SilentRow[], lorenaPhone: string | null): Composed {
  const mentions = new Set<string>();
  const bullet = (r: GrowthRow) => {
    const link = igUrl(r.instagram_handle);
    const label = link ? `${r.name ?? r.instagram_handle} — ${link}` : (r.name ?? "?");
    return `   • ${label}\n     promo ${r.promo_days}/${r.mtd_day ?? "?"} este mes · ingreso ${trendStr(r.income_trend_pct)} (${money(r.income_mtd)})`;
  };
  const silentBullet = (r: SilentRow) => {
    const link = igUrl(r.instagram_handle);
    const label = link ? `${r.name ?? r.instagram_handle} — ${link}` : (r.name ?? "?");
    return `   • ${label}\n     hace ${r.days_since_contact}d sin escribirle + no promociona (${r.promo_days}/${r.mtd_day}) → escribile e incentivá promo`;
  };

  // Las creadoras "sin contacto + sin promo" se muestran en su propia sección 📵
  // (acción más directa) y se sacan de los cuadrantes para no listarlas dos veces.
  const silentIds = new Set(silentRows.map((s) => s.creator_id));
  const silentByMgr = new Map<string, SilentRow[]>();
  for (const s of silentRows) {
    const k = s.manager_profile_id ?? "sin_manager";
    if (!silentByMgr.has(k)) silentByMgr.set(k, []);
    silentByMgr.get(k)!.push(s);
  }

  // Agrupar por manager preservando el orden del feed (ya viene por prioridad + ingreso desc).
  const order: string[] = [];
  const byMgr = new Map<string, GrowthRow[]>();
  for (const r of rows) {
    const k = r.manager_profile_id ?? "sin_manager";
    if (!byMgr.has(k)) { byMgr.set(k, []); order.push(k); }
    byMgr.get(k)!.push(r);
  }
  // Managers que sólo aparecen por la señal de contacto (sin filas en el feed) — improbable
  // (silent ⊆ low_promo ⊆ feed) pero lo cubrimos para no perder el aviso.
  for (const k of silentByMgr.keys()) if (!byMgr.has(k)) { byMgr.set(k, []); order.push(k); }

  const critTotal = rows.filter((r) => r.quadrant === "critico").length;
  const calTotal = rows.filter((r) => r.quadrant === "calidad").length;
  const riesgoTotal = rows.filter((r) => r.quadrant === "riesgo").length;
  if (!rows.length && !silentRows.length) {
    return { message: null, mentions: [], counts: { total: 0, critico: 0, calidad: 0, riesgo: 0, silent: 0, managers: 0 } };
  }

  const lines: string[] = [
    `🎯 *Supervisión de crecimiento* — ${rows.length} modelos necesitan atención`,
    `_Promoción × ingresos, mes a la fecha (vs mismo tramo del mes pasado)_`,
    "",
  ];

  for (const k of order) {
    const g = byMgr.get(k)!;
    const sil = silentByMgr.get(k) ?? [];
    // Datos de la manager desde el feed o, si sólo aparece por la señal de contacto, desde ahí.
    const head = g[0] ?? sil[0];
    if (!head) continue;
    const mgrName = firstName(head.manager_name);
    const mgrPhone = head.manager_phone;
    const tag = mgrPhone ? `@${phoneToken(mgrPhone)}` : mgrName;
    if (mgrPhone) mentions.add(jidOf(mgrPhone));

    // Los cuadrantes NO repiten a las creadoras que van en la sección 📵.
    const crit = g.filter((r) => r.quadrant === "critico" && !silentIds.has(r.creator_id));
    const cal = g.filter((r) => r.quadrant === "calidad" && !silentIds.has(r.creator_id));
    const rie = g.filter((r) => r.quadrant === "riesgo" && !silentIds.has(r.creator_id));
    const alertCount = crit.length + cal.length + rie.length + sil.length;

    lines.push(`👤 ${tag} *${mgrName}* — ${alertCount} en alerta`);

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
    if (sil.length) {
      lines.push(`📵 Sin contacto + sin promo (${sil.length}) — escribiles:`);
      lines.push(...sil.map(silentBullet));
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
    counts: { total: rows.length, critico: critTotal, calidad: calTotal, riesgo: riesgoTotal, silent: silentRows.length, managers: order.length },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as {
    dry_run?: boolean;
    promo_window?: number;
    low_promo_days?: number;
    low_promo_rate?: number;
    income_drop_pct?: number;
    silent_days?: number;
  };
  const dryRun = body?.dry_run === true;

  const sb = adminClient();

  // Cerebro.
  const { data: feed, error: feedErr } = await sb.rpc("get_manager_growth_feed", {
    p_tenant: TENANT_ID,
    p_low_promo_rate: Number(body?.low_promo_rate ?? 0.40),
    p_income_drop_pct: Number(body?.income_drop_pct ?? 15),
  });
  if (feedErr) return json({ ok: false, error: feedErr.message }, 500);
  const rows = (feed ?? []) as GrowthRow[];

  // Señal de contacto: creadoras sin escribir hace >= N días por la línea de Managers
  // Y sin promo (get_manager_silent_no_promo). La línea se conectó 2026-07-16 → esto se
  // va "calentando" a medida que entran conversaciones; hoy devuelve vacío (sin falsos).
  const { data: silentData } = await sb.rpc("get_manager_silent_no_promo", {
    p_tenant: TENANT_ID,
    p_days: Number(body?.silent_days ?? 3),
    p_low_promo_rate: Number(body?.low_promo_rate ?? 0.40),
  });
  const silentRows = (silentData ?? []) as SilentRow[];

  // Teléfono de Lorena (perfil estable, teléfono actual).
  let lorenaPhone: string | null = null;
  {
    const { data: lp } = await sb.from("profiles").select("phone_e164").eq("id", LORENA_PROFILE_ID).maybeSingle();
    lorenaPhone = lp?.phone_e164 ?? null;
  }

  const { message, mentions, counts } = compose(rows, silentRows, lorenaPhone);
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
