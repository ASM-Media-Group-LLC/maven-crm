// detectar-tardanzas — corre cada 2 min (pg_cron). Para cada persona con horario
// asignado, si ya pasó la tolerancia y tiene primer_ingreso del día > esperado,
// inserta en tardanzas_registro y manda correo de constancia al dueño + manager
// + supervisor + el propio empleado. Dedup por unique(user_id, dia): aunque corra
// 100 veces solo avisa una vez por día por persona.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("INTERNAL_CRON_TOKEN") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

interface Persona {
  user_id: string; tenant_id: string;
  entrada: string;  // 'HH:MM:SS'
  tolerancia: number;
  turno_nombre: string | null;
  manager_id: string | null;
  supervisor_id: string | null;
}

/** Devuelve la fecha YYYY-MM-DD en Bogotá para el instante dado. */
function diaBogota(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function minutosDeHora(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Dueño del tenant (para incluirlo en los destinatarios). */
async function dueno(admin: ReturnType<typeof createClient>, tenant: string): Promise<string | null> {
  const { data } = await admin.from("tenant_owners").select("user_id").eq("tenant_id", tenant).limit(1).maybeSingle();
  return (data?.user_id as string | undefined) ?? null;
}

async function emailDe(admin: ReturnType<typeof createClient>, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  // Intenta profiles.email; si no, auth.users.email vía admin.
  const { data: p } = await admin.from("profiles").select("email").eq("id", userId).maybeSingle();
  if (p?.email) return p.email as string;
  const { data: u } = await admin.auth.admin.getUserById(userId);
  return (u?.user?.email as string | undefined) ?? null;
}

function correoHTML({ nombre, rol, horario, entro, tardeMin }: { nombre: string; rol: string | null; horario: string; entro: string; tardeMin: number }): string {
  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f1222">
<div style="max-width:600px;margin:0 auto;padding:28px 16px 40px">
  <div style="background:#fff;border:1px solid #e7e9f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px -24px rgba(24,21,60,.45)">
    <div style="height:5px;background:linear-gradient(90deg,#6d5efc,#8b78ff)"></div>
    <div style="padding:28px 30px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:22px">
        <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(140deg,#6d5efc,#8b78ff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:17px">M</div>
        <div><b style="font-size:15px">Maven</b><div style="font-size:12px;color:#6b7183">Argos · Control de asistencia</div></div>
      </div>
      <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e23d5b;background:#fdeef1;padding:5px 10px;border-radius:999px">⏱ Entrada tarde</span>
      <h1 style="font-size:22px;line-height:1.25;margin:14px 0 6px;font-weight:800">Constancia de entrada tarde</h1>
      <p style="font-size:14px;color:#6b7183;margin:0 0 22px">Se registró una entrada fuera de horario. Esta constancia queda en la tarjeta del empleado y en el historial del día.</p>
      <div style="display:flex;align-items:baseline;gap:10px;background:#f6f7fb;border:1px solid #e7e9f0;border-radius:14px;padding:16px 18px;margin-bottom:22px">
        <span style="font-size:40px;font-weight:800;color:#e23d5b;line-height:1;font-variant-numeric:tabular-nums">${tardeMin} min</span>
        <span style="font-size:13px;color:#6b7183;font-weight:600">tarde respecto a su horario</span>
      </div>
      <div style="border:1px solid #e7e9f0;border-radius:14px;overflow:hidden;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px;border-bottom:1px solid #e7e9f0"><span style="color:#6b7183">Empleado</span><span style="font-weight:700">${escapar(nombre)}${rol ? " · " + escapar(rol) : ""}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px;border-bottom:1px solid #e7e9f0"><span style="color:#6b7183">Horario de entrada</span><span style="font-weight:700;font-variant-numeric:tabular-nums">${horario}</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px"><span style="color:#6b7183">Entró a las</span><span style="font-weight:700;color:#e23d5b;font-variant-numeric:tabular-nums">${entro}</span></div>
      </div>
    </div>
    <div style="text-align:center;padding:18px;font-size:11.5px;color:#9aa0b2;background:#f6f7fb;border-top:1px solid #e7e9f0">Maven · generado automáticamente por Argos</div>
  </div>
</div></body></html>`;
}
function escapar(s: string): string { return (s ?? "").replace(/[&<>"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]!)); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // Autenticación: X-Cron-Token o service_role bearer.
  const token = req.headers.get("x-cron-token");
  const auth = req.headers.get("authorization") ?? "";
  if (token !== CRON_TOKEN && !auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const ahora = new Date();
  const hoy = diaBogota(ahora);

  // Trae a todos los que tienen horario resuelto (persona > turno > rol).
  // Para mantener la query simple, bajo todo y calculo en TS.
  const [{ data: perfiles }, { data: roles }, { data: cfgRoles }, { data: turnos }] = await Promise.all([
    admin.from("profiles").select("id, tenant_id, full_name, hora_entrada, hora_salida, turno_id, deleted_at").is("deleted_at", null),
    admin.from("user_roles").select("user_id, role"),
    admin.from("roles_config").select("name, hora_entrada, tolerancia_min").eq("is_active", true),
    admin.from("rol_turnos").select("id, role, nombre, hora_entrada"),
  ]);

  const rolPor = new Map<string, string>();
  for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) if (!rolPor.has(r.user_id)) rolPor.set(r.user_id, r.role);
  const cfgPor = new Map<string, { hora_entrada: string | null; tolerancia_min: number | null }>();
  for (const r of (cfgRoles ?? []) as Array<{ name: string; hora_entrada: string | null; tolerancia_min: number | null }>) cfgPor.set(r.name, r);
  const turnoPorId = new Map<string, { role: string; nombre: string; hora_entrada: string }>();
  for (const t of (turnos ?? []) as Array<{ id: string; role: string; nombre: string; hora_entrada: string }>) turnoPorId.set(t.id, { role: t.role, nombre: t.nombre, hora_entrada: t.hora_entrada });

  // Candidatos: tienen entrada resuelta y ya pasó la tolerancia hoy.
  const nowMin = (() => {
    // Minutos desde medianoche en Bogotá.
    const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(ahora);
    return minutosDeHora(hhmm);
  })();

  const candidatos: Persona[] = [];
  for (const p of (perfiles ?? []) as Array<{ id: string; tenant_id: string; hora_entrada: string | null; turno_id: string | null }>) {
    const rol = rolPor.get(p.id);
    const turno = p.turno_id ? turnoPorId.get(p.turno_id) : null;
    const entrada = p.hora_entrada ?? turno?.hora_entrada ?? (rol ? cfgPor.get(rol)?.hora_entrada ?? null : null);
    if (!entrada) continue;
    const tol = (rol ? cfgPor.get(rol)?.tolerancia_min : null) ?? 5;
    const asignadoMin = minutosDeHora(entrada);
    // Ya debió llegar hace al menos (tolerancia) minutos.
    if (nowMin < asignadoMin + tol) continue;
    candidatos.push({
      user_id: p.id, tenant_id: p.tenant_id, entrada, tolerancia: tol,
      turno_nombre: turno?.nombre ?? null,
      manager_id: null, supervisor_id: null,
    });
  }
  if (candidatos.length === 0) {
    return new Response(JSON.stringify({ ok: true, candidatos: 0 }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Ya avisados hoy.
  const { data: yaAv } = await admin.from("tardanzas_registro").select("user_id").eq("dia", hoy);
  const avisados = new Set(((yaAv ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const pendientes = candidatos.filter((c) => !avisados.has(c.user_id));
  if (pendientes.length === 0) {
    return new Response(JSON.stringify({ ok: true, candidatos: candidatos.length, pendientes: 0 }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Primer ingreso de hoy por persona.
  const inicioHoyISO = `${hoy}T00:00:00-05:00`;
  const finHoyISO = `${hoy}T23:59:59-05:00`;
  const { data: seg } = await admin.from("cowork_tiempo_segmentos")
    .select("user_id, started_at")
    .in("user_id", pendientes.map((p) => p.user_id))
    .in("estado", ["activo", "sin_pantalla", "sin_camara", "fuera_de_camara"])
    .gte("started_at", inicioHoyISO).lte("started_at", finHoyISO)
    .order("started_at", { ascending: true });
  const primeroPor = new Map<string, Date>();
  for (const s of (seg ?? []) as Array<{ user_id: string; started_at: string }>) {
    if (!primeroPor.has(s.user_id)) primeroPor.set(s.user_id, new Date(s.started_at));
  }

  const nombresPor = new Map<string, string>();
  for (const p of (perfiles ?? []) as Array<{ id: string; full_name: string | null }>) nombresPor.set(p.id, p.full_name?.trim() || "—");

  let avisadosNuevos = 0;
  for (const c of pendientes) {
    const primero = primeroPor.get(c.user_id);
    if (!primero) continue; // Aún no se conectó hoy; esto es ausencia, no tardanza aquí.
    const primeroHHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(primero);
    const realMin = minutosDeHora(primeroHHMM);
    const tarde = realMin - minutosDeHora(c.entrada);
    if (tarde <= c.tolerancia) continue;

    // Destinatarios: empleado + dueño + admins + managers + supervisores.
    const emails: string[] = [];
    const push = async (uid: string | null) => { const e = await emailDe(admin, uid); if (e && !emails.includes(e)) emails.push(e); };
    await push(c.user_id);
    await push(await dueno(admin, c.tenant_id));
    const { data: jefes } = await admin.from("profiles").select("id").in("nivel", ["admin","manager","supervisor"]).eq("tenant_id", c.tenant_id);
    for (const j of (jefes ?? []) as Array<{ id: string }>) await push(j.id);

    // Insertar la tardanza (gatea con unique: si otro cron corre a la vez, uno gana).
    const ins = await admin.from("tardanzas_registro").insert({
      tenant_id: c.tenant_id, user_id: c.user_id, dia: hoy,
      turno_nombre: c.turno_nombre, horario_asignado: c.entrada,
      entro_at: primero.toISOString(), tarde_min: tarde, tolerancia_min: c.tolerancia,
      correo_a: emails,
    }).select("id").single();
    if (ins.error) continue; // dedup o error → siguiente

    // Mandar correo
    try {
      const nombre = nombresPor.get(c.user_id) ?? "—";
      const rol = rolPor.get(c.user_id) ?? null;
      const horaHHMM = c.entrada.slice(0, 5);
      const html = correoHTML({ nombre, rol, horario: horaHHMM, entro: primeroHHMM, tardeMin: tarde });
      await admin.functions.invoke("send-notification-email", {
        body: { to: emails, subject: `⏱ Entrada tarde — ${nombre} (+${tarde} min)`, html, tag: "tardanza" },
      });
      await admin.from("tardanzas_registro").update({ correo_enviado: true, correo_enviado_at: new Date().toISOString() }).eq("id", ins.data.id);
      avisadosNuevos++;
    } catch { /* el registro ya quedó; el correo se puede reintentar manualmente */ }
  }

  return new Response(JSON.stringify({ ok: true, candidatos: candidatos.length, pendientes: pendientes.length, avisadosNuevos }), { headers: { ...CORS, "Content-Type": "application/json" } });
});
