// Vigilante de la Salud de la plataforma (Alvaro, 08/11/2026 noche).
// Corre cada ~2 min por cron. Revisa 4 señales; si una está en problema,
// ABRE un incidente (idempotente — único por tipo abierto) y manda push
// al dueño + banner en Maven (que lee salud_incidentes). Si ya se arregló,
// CIERRA el incidente abierto (y notifica "resuelto").
//
// Las 4 señales:
//   • nas_caido        → ping /salud al NAS falla
//   • correo_atascado  → hay tardanza_registro de >10 min con correo_enviado=false
//   • argos_sin_juzgar → monitor_capturas con veredicto en los últimos 15 min = 0
//                        y HAY al menos 1 pantallazo nuevo (equipo activo)
//   • cron_parado      → el cron detectar-tardanzas o drive-aporte-nas lleva >2h
//                        sin correr (según cron.job_run_details)
//
// Autorización: cron (X-Cron-Token). No requiere jwt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const NAS = (Deno.env.get("DRIVE_NAS_URL") ?? "").replace(/\/+$/, "");
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.maven-ai.me").replace(/\/+$/, "");

type Tipo = "nas_caido" | "correo_atascado" | "argos_sin_juzgar" | "cron_parado";
interface Senal { tipo: Tipo; mal: boolean; mensaje: string }

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

async function pingNAS(): Promise<{ arriba: boolean; motivo: string }> {
  if (!NAS) return { arriba: true, motivo: "sin NAS configurado" };
  let arribaPing = false;
  try {
    const r = await fetch(`${NAS}/salud`, { signal: AbortSignal.timeout(6000) });
    if (r.ok) {
      const body = await r.json().catch(() => null) as { raices?: Array<{ ok: boolean }> } | null;
      arribaPing = !!body?.raices?.some((x) => x.ok);
    }
  } catch { arribaPing = false; }
  if (!arribaPing) return { arriba: false, motivo: "no responde al ping" };
  // El ping dice "estoy", pero si los aportes NO fluyen hace >30 min aunque
  // haya pendientes, igual es caído (el NAS está arriba como proceso pero no
  // está haciendo su trabajo). Alvaro (08/11): "el NAS sigue sin aparecer y
  // tú dices OK — pega tu criterio a lo real".
  const hace30 = new Date(Date.now() - 30 * 60_000).toISOString();
  // Ignorar basura de 0 bytes (archivos vacíos que nunca podrán subir).
  const { count: pendientesViejos } = await admin.from("drive_aportes")
    .select("id", { count: "exact", head: true })
    .eq("en_nas", false)
    .gt("size", 0)
    .lt("created_at", hace30);
  const n = pendientesViejos ?? 0;
  if (n > 0) return { arriba: false, motivo: `${n} aporte(s) atascado(s) hace +30 min` };
  return { arriba: true, motivo: "responde y aportes fluyen" };
}

async function chequearCorreo(): Promise<Senal> {
  // Tardanza registrada hace > 10 min sin correo enviado.
  const { count } = await admin.from("tardanzas_registro")
    .select("id", { count: "exact", head: true })
    .eq("correo_enviado", false)
    .lt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  const n = count ?? 0;
  return n > 0
    ? { tipo: "correo_atascado", mal: true, mensaje: `${n} correo(s) de tardanza sin salir hace +10 min` }
    : { tipo: "correo_atascado", mal: false, mensaje: "Correos al día" };
}

async function chequearArgos(): Promise<Senal> {
  const hace15 = new Date(Date.now() - 15 * 60_000).toISOString();
  const [juzgadas, pantallazos] = await Promise.all([
    admin.from("monitor_capturas").select("id", { count: "exact", head: true })
      .not("veredicto", "is", null).gte("created_at", hace15),
    admin.from("monitor_capturas").select("id", { count: "exact", head: true })
      .gte("created_at", hace15),
  ]);
  const j = juzgadas.count ?? 0, p = pantallazos.count ?? 0;
  // Solo se escala si HAY pantallazos nuevos (equipo activo) pero NINGUNO
  // juzgado: así fin de semana o 4am (sin equipo) no dispara alerta.
  if (p >= 5 && j === 0) return { tipo: "argos_sin_juzgar", mal: true, mensaje: `${p} pantallazos en 15 min, ninguno juzgado` };
  return { tipo: "argos_sin_juzgar", mal: false, mensaje: "Argos juzgando OK" };
}

async function chequearCrons(): Promise<Senal> {
  // cron.job_run_details: el último run de los crons críticos.
  const nombres = ["detectar-tardanzas", "drive-aporte-nas-ping"]; // los que tienen ritmo <2h
  const resultados: Array<{ nombre: string; hace_min: number | null }> = [];
  for (const jobname of nombres) {
    // Usamos un RPC inline con sql; si no, consultamos cron.job y cron.job_run_details.
    const { data } = await admin.rpc("sql_salud_cron_hace", { _jobname: jobname }).select().maybeSingle() as unknown as { data: { hace_min: number | null } | null };
    resultados.push({ nombre: jobname, hace_min: data?.hace_min ?? null });
  }
  const parados = resultados.filter((r) => r.hace_min != null && r.hace_min > 120);
  if (parados.length) {
    const lista = parados.map((p) => `${p.nombre} (${Math.round(p.hace_min!)} min)`).join(", ");
    return { tipo: "cron_parado", mal: true, mensaje: `Robot(s) parado(s): ${lista}` };
  }
  return { tipo: "cron_parado", mal: false, mensaje: "Robots al día" };
}

async function escalar(senal: Senal): Promise<"abierto" | "ya_abierto" | "cerrado" | "sigue_cerrado"> {
  if (senal.mal) {
    // ¿ya hay uno abierto?
    const { data: existe } = await admin.from("salud_incidentes")
      .select("id, push_at").eq("tipo", senal.tipo).is("cerrado_at", null).maybeSingle();
    if (existe) return "ya_abierto";
    const { data: ins } = await admin.from("salud_incidentes")
      .insert({ tipo: senal.tipo, mensaje: senal.mensaje }).select("id").single();
    if (ins?.id) await enviarPush(senal, "problema");
    return "abierto";
  }
  // está bien: cerrar el abierto si lo hay
  const { data: existe } = await admin.from("salud_incidentes")
    .select("id").eq("tipo", senal.tipo).is("cerrado_at", null).maybeSingle();
  if (!existe) return "sigue_cerrado";
  await admin.from("salud_incidentes").update({ cerrado_at: new Date().toISOString() }).eq("id", existe.id);
  await enviarPush(senal, "resuelto");
  return "cerrado";
}

async function enviarPush(senal: Senal, modo: "problema" | "resuelto") {
  // Al DUEÑO (tenant_owners). Si no hay token, sale limpio sin romper.
  const { data: duenos } = await admin.from("tenant_owners").select("user_id");
  const ids = (duenos ?? []).map((d: { user_id: string }) => d.user_id);
  if (ids.length === 0) return;
  const title = modo === "problema" ? "🚨 Problema en Maven" : "✅ Problema resuelto";
  const body = senal.mensaje;
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/web-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Token": CRON_TOKEN,
        "Authorization": `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({
        action: "notify",
        kind: `salud_${senal.tipo}_${modo}`,
        ids,
        title,
        body,
        url: `${APP_URL}/dashboard`,
        tag: `salud_${senal.tipo}`,
        prioridad: "urgente",
      }),
    });
    await admin.from("salud_incidentes").update({ push_at: new Date().toISOString() })
      .eq("tipo", senal.tipo).is("cerrado_at", modo === "resuelto" ? null : null);
  } catch (e) {
    console.warn("salud-vigilante: push falló", (e as Error)?.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (!CRON_TOKEN || req.headers.get("X-Cron-Token") !== CRON_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "auth" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const senales: Senal[] = [];
  const nas = await pingNAS();
  senales.push({ tipo: "nas_caido", mal: !nas.arriba, mensaje: `NAS: ${nas.motivo}` });
  senales.push(await chequearCorreo());
  senales.push(await chequearArgos());
  // chequearCrons depende de un RPC sql_salud_cron_hace que puede no existir aún:
  // lo protegemos.
  try { senales.push(await chequearCrons()); }
  catch (e) { console.warn("vigilante cron chequeo falló", (e as Error)?.message); }

  const resumen: Record<string, string> = {};
  for (const s of senales) resumen[s.tipo] = await escalar(s);
  return new Response(JSON.stringify({ ok: true, resumen }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
