// detectar-tardanzas — corre cada 2 min (pg_cron). Para cada persona con horario
// asignado detecta DOS cosas y, por cada una, inserta su registro + manda correo
// (dedup por día con unique(user_id, dia)):
//
//   1) TARDANZA: primer ingreso del día > horario + tolerancia. Correo de
//      constancia de entrada tarde. Tabla tardanzas_registro.
//   2) SIN CÁMARA AL INICIO (Alvaro, 08/11): se conectó a tiempo pero NO tuvo la
//      cámara encendida en los primeros 15 min del turno. Correo aparte. Tabla
//      camara_inicio_registro. No aplica a exonerados de cámara.
//
//   3) DESCUENTO DEL DÍA (Alvaro, 16/11): al cerrar el turno, si la persona pasó
//      de sus minutos de gracia (15 sin pantalla, 15 sin cámara), correo a ella, a
//      su jefe y a RR. HH. La cuenta la hace la base (argos_gracia_por_correo).
//
//   4) PRIMER CONTACTO (Alvaro, 18/11): dos chatters abrieron su primer chat
//      directo → correo al dueño, admins y anotados de la agencia
//      (contacto_primer_contacto_por_correo).
//
// Ambas son sanción aparte: no tocan la nota. Destinatarios: el empleado + el
// dueño + los jefes (nivel admin/manager/supervisor) del mismo tenant.
//
// BUG histórico arreglado (08/11): la edge pedía profiles.tenant_id (no existe)
// → la query fallaba y candidatos=0 SIEMPRE. El tenant real sale de tenant_members.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { asuntoGracia, correoGraciaHTML, type CierreGracia } from "../_shared/correo-gracia.ts";
import { asuntoPrimerContacto, correoPrimerContactoHTML, type PrimerContacto } from "../_shared/correo-primer-contacto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("INTERNAL_CRON_TOKEN") ?? Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const VENTANA_CAMARA_MIN = 15;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
};

// deno-lint-ignore no-explicit-any
type Admin = any;

function diaBogota(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function minDeHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
/** Minutos desde medianoche en Bogotá para un instante dado. */
function minBogota(d: Date): number {
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return minDeHHMM(hhmm);
}
function hhmmBogota(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
function escapar(s: string): string { return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }

function correoTardanza({ nombre, rol, horario, entro, tardeMin }: { nombre: string; rol: string | null; horario: string; entro: string; tardeMin: number }): string {
  return envoltura(`
    <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#e23d5b;background:#fdeef1;padding:5px 10px;border-radius:999px">⏱ Entrada tarde</span>
    <h1 style="font-size:22px;line-height:1.25;margin:14px 0 6px;font-weight:800">Constancia de entrada tarde</h1>
    <p style="font-size:14px;color:#6b7183;margin:0 0 22px">Se registró una entrada fuera de horario. Queda de constancia; no afecta la nota del día.</p>
    <div style="display:flex;align-items:baseline;gap:10px;background:#f6f7fb;border:1px solid #e7e9f0;border-radius:14px;padding:16px 18px;margin-bottom:22px">
      <span style="font-size:40px;font-weight:800;color:#e23d5b;line-height:1;font-variant-numeric:tabular-nums">${tardeMin} min</span>
      <span style="font-size:13px;color:#6b7183;font-weight:600">tarde respecto a su horario</span>
    </div>
    ${filasEmpleado(nombre, rol, [["Horario de entrada", horario], ["Entró a las", entro, "#e23d5b"]])}
  `);
}
function correoCamara({ nombre, rol, ventana, entro }: { nombre: string; rol: string | null; ventana: number; entro: string }): string {
  return envoltura(`
    <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c2410c;background:#fff3ea;padding:5px 10px;border-radius:999px">📷 Cámara apagada al inicio</span>
    <h1 style="font-size:22px;line-height:1.25;margin:14px 0 6px;font-weight:800">No prendiste la cámara al empezar</h1>
    <p style="font-size:14px;color:#6b7183;margin:0 0 22px">Te conectaste a tiempo, pero no tuviste la cámara encendida en los primeros <b>${ventana} minutos</b> del turno. Queda de constancia; no afecta la nota del día.</p>
    <div style="display:flex;align-items:baseline;gap:10px;background:#f6f7fb;border:1px solid #e7e9f0;border-radius:14px;padding:16px 18px;margin-bottom:22px">
      <span style="font-size:40px;font-weight:800;color:#c2410c;line-height:1;font-variant-numeric:tabular-nums">${ventana} min</span>
      <span style="font-size:13px;color:#6b7183;font-weight:600">sin cámara al empezar el turno</span>
    </div>
    ${filasEmpleado(nombre, rol, [["Se conectó a las", entro]])}
  `);
}
function filasEmpleado(nombre: string, rol: string | null, extra: Array<[string, string, string?]>): string {
  const fila = (k: string, v: string, color?: string, borde = true) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:13px 16px;font-size:14px;${borde ? "border-bottom:1px solid #e7e9f0" : ""}"><span style="color:#6b7183">${k}</span><span style="font-weight:700;${color ? `color:${color};` : ""}font-variant-numeric:tabular-nums">${escapar(v)}</span></div>`;
  const filas = [fila("Empleado", `${nombre}${rol ? " · " + rol : ""}`)].concat(extra.map(([k, v, c], i) => fila(k, v, c, i < extra.length - 1)));
  return `<div style="border:1px solid #e7e9f0;border-radius:14px;overflow:hidden;margin-bottom:20px">${filas.join("")}</div>`;
}
function envoltura(cuerpo: string): string {
  return `<!doctype html><html><body style="margin:0;background:#eef1f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f1222">
<div style="max-width:600px;margin:0 auto;padding:28px 16px 40px">
  <div style="background:#fff;border:1px solid #e7e9f0;border-radius:18px;overflow:hidden;box-shadow:0 18px 50px -24px rgba(24,21,60,.45)">
    <div style="height:5px;background:linear-gradient(90deg,#6d5efc,#8b78ff)"></div>
    <div style="padding:28px 30px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:22px">
        <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(140deg,#6d5efc,#8b78ff);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:17px">M</div>
        <div><b style="font-size:15px">Maven</b><div style="font-size:12px;color:#6b7183">Argos · Control de asistencia</div></div>
      </div>
      ${cuerpo}
    </div>
    <div style="text-align:center;padding:18px;font-size:11.5px;color:#9aa0b2;background:#f6f7fb;border-top:1px solid #e7e9f0">Maven · generado automáticamente por Argos</div>
  </div>
</div></body></html>`;
}

// ── 3) DESCUENTO DEL DÍA ──
// La base cierra los turnos, recalcula lo que RR. HH. tocó y dice qué correos
// faltan. Aquí solo se buscan los correos y se manda: persona + jefe + RR. HH.
async function correrGracia(admin: Admin): Promise<{ pendientes: number; enviados: number; errores: number }> {
  const { data, error } = await admin.rpc("argos_gracia_por_correo");
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as CierreGracia[];
  if (filas.length === 0) return { pendientes: 0, enviados: 0, errores: 0 };

  const emailPor = new Map<string, string>();
  const { data: lista, error: errLista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (errLista) throw new Error(errLista.message); // sin correos no se marca nada: se reintenta en 2 min
  for (const u of (lista?.users ?? []) as Array<{ id: string; email?: string }>) if (u.email) emailPor.set(u.id, u.email);

  let enviados = 0, errores = 0;
  for (const f of filas) {
    const to = [...new Set([f.user_id, ...(f.destinatarios ?? [])].map((id) => emailPor.get(id)).filter((e): e is string => !!e))];
    if (to.length === 0) { errores++; continue; }
    const { error: errEnvio } = await admin.functions.invoke("send-notification-email", {
      body: { to, subject: asuntoGracia(f), html: correoGraciaHTML(f), tag: f.es_correccion ? "gracia-correccion" : "gracia-descuento" },
    });
    if (errEnvio) { errores++; continue; } // queda pendiente: se reintenta en la próxima vuelta
    const { error: errMarca } = await admin.rpc("argos_gracia_marcar_correo", { _uid: f.user_id, _turno: f.turno, _correo_a: to });
    if (errMarca) errores++; else enviados++;
  }
  return { pendientes: filas.length, enviados, errores };
}

// ── 4) PRIMER CONTACTO ENTRE CHATTERS (Alvaro, 18/11) ──
// La base anota la pareja la primera vez que dos personas de un rol aislado abren
// un chat directo (y pone la campana). Aquí sale el correo al dueño, a los admins
// y a los anotados de la agencia; nunca con lo que se escribieron.
async function correrPrimerContacto(admin: Admin): Promise<{ pendientes: number; enviados: number; errores: number }> {
  const { data, error } = await admin.rpc("contacto_primer_contacto_por_correo");
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as PrimerContacto[];
  if (filas.length === 0) return { pendientes: 0, enviados: 0, errores: 0 };

  const emailPor = new Map<string, string>();
  const { data: lista, error: errLista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (errLista) throw new Error(errLista.message);
  for (const u of (lista?.users ?? []) as Array<{ id: string; email?: string }>) if (u.email) emailPor.set(u.id, u.email);

  let enviados = 0, errores = 0;
  for (const f of filas) {
    const to = [...new Set((f.destinatarios ?? []).map((id) => emailPor.get(id)).filter((e): e is string => !!e))];
    if (to.length === 0) {
      // Nadie con correo: se marca igual (la campana ya avisó) para no reintentar para siempre.
      await admin.rpc("contacto_primer_contacto_marcar_correo", { _tenant: f.tenant_id, _a: f.a, _b: f.b, _correo_a: [] });
      continue;
    }
    const { error: errEnvio } = await admin.functions.invoke("send-notification-email", {
      body: { to, subject: asuntoPrimerContacto(f), html: correoPrimerContactoHTML(f), tag: "primer-contacto" },
    });
    if (errEnvio) { errores++; continue; } // queda pendiente: se reintenta en la próxima vuelta
    const { error: errMarca } = await admin.rpc("contacto_primer_contacto_marcar_correo", { _tenant: f.tenant_id, _a: f.a, _b: f.b, _correo_a: to });
    if (errMarca) errores++; else enviados++;
  }
  return { pendientes: filas.length, enviados, errores };
}

interface Persona {
  user_id: string; tenant_id: string;
  entrada: string; entradaMin: number; tolerancia: number;
  turno_nombre: string | null; rol: string | null; nombre: string; exento: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const token = req.headers.get("x-cron-token");
  const auth = req.headers.get("authorization") ?? "";
  if (token !== CRON_TOKEN && !auth.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauth" }), { status: 401, headers: { ...CORS, "Content-Type": "application/json" } });
  }

  const admin: Admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  // El descuento del día va primero y aparte: no depende de quién tiene hora de entrada.
  const gracia = await correrGracia(admin).catch((e) => ({ error: (e as Error).message }));
  // El aviso del primer contacto entre chatters (también aparte).
  const primerContacto = await correrPrimerContacto(admin).catch((e) => ({ error: (e as Error).message }));
  const ahora = new Date();
  const hoy = diaBogota(ahora);
  const nowMin = minBogota(ahora);

  // Carga base. OJO: profiles NO tiene tenant_id; el tenant sale de tenant_members.
  const [{ data: perfiles }, { data: miembros }, { data: roles }, { data: cfgRoles }, { data: turnos }] = await Promise.all([
    admin.from("profiles").select("id, full_name, hora_entrada, turno_id, nivel, is_owner, exonera_camara_pantalla, deleted_at").is("deleted_at", null),
    admin.from("tenant_members").select("user_id, tenant_id"),
    admin.from("user_roles").select("user_id, role"),
    admin.from("roles_config").select("name, hora_entrada, tolerancia_min, exonera_camara_pantalla").eq("is_active", true),
    admin.from("rol_turnos").select("id, nombre, hora_entrada"),
  ]);

  const tenantPor = new Map<string, string>();
  for (const m of (miembros ?? []) as Array<{ user_id: string; tenant_id: string }>) if (!tenantPor.has(m.user_id)) tenantPor.set(m.user_id, m.tenant_id);
  const rolPor = new Map<string, string>();
  for (const r of (roles ?? []) as Array<{ user_id: string; role: string }>) if (!rolPor.has(r.user_id)) rolPor.set(r.user_id, r.role);
  const cfgPor = new Map<string, { hora_entrada: string | null; tolerancia_min: number | null; exonera_camara_pantalla: boolean | null }>();
  for (const r of (cfgRoles ?? []) as Array<{ name: string; hora_entrada: string | null; tolerancia_min: number | null; exonera_camara_pantalla: boolean | null }>) cfgPor.set(r.name, r);
  const turnoPorId = new Map<string, { nombre: string; hora_entrada: string }>();
  for (const t of (turnos ?? []) as Array<{ id: string; nombre: string; hora_entrada: string }>) turnoPorId.set(t.id, { nombre: t.nombre, hora_entrada: t.hora_entrada });

  type Perfil = { id: string; full_name: string | null; hora_entrada: string | null; turno_id: string | null; nivel: string | null; is_owner: boolean | null; exonera_camara_pantalla: boolean | null };
  const perfilesArr = (perfiles ?? []) as Perfil[];

  // Destinatarios por tenant: dueño + jefes (nivel admin/manager/supervisor).
  const jefesPorTenant = new Map<string, Set<string>>();
  for (const p of perfilesArr) {
    const tid = tenantPor.get(p.id);
    if (!tid) continue;
    const esJefe = p.is_owner === true || ["admin", "manager", "supervisor", "dueno"].includes((p.nivel ?? "").toLowerCase());
    if (esJefe) {
      if (!jefesPorTenant.has(tid)) jefesPorTenant.set(tid, new Set());
      jefesPorTenant.get(tid)!.add(p.id);
    }
  }

  // Candidatos con horario resuelto.
  const candidatos: Persona[] = [];
  for (const p of perfilesArr) {
    const tenant = tenantPor.get(p.id);
    if (!tenant) continue;
    const rol = rolPor.get(p.id) ?? null;
    const turno = p.turno_id ? turnoPorId.get(p.turno_id) : null;
    const entrada = p.hora_entrada ?? turno?.hora_entrada ?? (rol ? cfgPor.get(rol)?.hora_entrada ?? null : null);
    if (!entrada) continue;
    const tol = (rol ? cfgPor.get(rol)?.tolerancia_min : null) ?? 5;
    const exento = p.exonera_camara_pantalla === true || (rol ? cfgPor.get(rol)?.exonera_camara_pantalla === true : false);
    candidatos.push({
      user_id: p.id, tenant_id: tenant, entrada, entradaMin: minDeHHMM(entrada), tolerancia: tol,
      turno_nombre: turno?.nombre ?? null, rol, nombre: p.full_name?.trim() || "—", exento,
    });
  }
  if (candidatos.length === 0) {
    return new Response(JSON.stringify({ ok: true, candidatos: 0, gracia, primerContacto }), { headers: { ...CORS, "Content-Type": "application/json" } });
  }

  // Ya avisados hoy (cada tipo su tabla).
  const [{ data: yaTard }, { data: yaCam }] = await Promise.all([
    admin.from("tardanzas_registro").select("user_id").eq("dia", hoy),
    admin.from("camara_inicio_registro").select("user_id").eq("dia", hoy),
  ]);
  const avisadosTard = new Set(((yaTard ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const avisadosCam = new Set(((yaCam ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));

  // Segmentos de hoy de todos los candidatos (una sola query).
  const inicioHoyISO = `${hoy}T00:00:00-05:00`;
  const finHoyISO = `${hoy}T23:59:59-05:00`;
  const ids = candidatos.map((c) => c.user_id);
  const { data: seg } = await admin.from("cowork_tiempo_segmentos")
    .select("user_id, started_at, ended_at, last_seen_at, estado")
    .in("user_id", ids)
    .gte("started_at", inicioHoyISO).lte("started_at", finHoyISO)
    .order("started_at", { ascending: true });

  const PRESENTE = new Set(["activo", "pausa", "sin_pantalla", "sin_camara", "fuera_de_camara"]);
  interface Seg { ini: number; fin: number; estado: string }
  const segPor = new Map<string, Seg[]>();
  for (const s of (seg ?? []) as Array<{ user_id: string; started_at: string; ended_at: string | null; last_seen_at: string | null; estado: string }>) {
    const ini = minBogota(new Date(s.started_at));
    const finISO = s.ended_at ?? s.last_seen_at ?? s.started_at;
    const fin = Math.max(ini, minBogota(new Date(finISO)));
    if (!segPor.has(s.user_id)) segPor.set(s.user_id, []);
    segPor.get(s.user_id)!.push({ ini, fin, estado: s.estado });
  }

  // Emails de todos (una pasada por auth; profiles no tiene columna email).
  const emailPor = new Map<string, string>();
  try {
    const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of (lista?.users ?? []) as Array<{ id: string; email?: string }>) if (u.email) emailPor.set(u.id, u.email);
  } catch { /* si falla, los correos salen vacíos pero el registro queda */ }

  const emailsDestino = (c: Persona): string[] => {
    const set = new Set<string>();
    const mio = emailPor.get(c.user_id); if (mio) set.add(mio);
    for (const j of jefesPorTenant.get(c.tenant_id) ?? []) { const e = emailPor.get(j); if (e) set.add(e); }
    return [...set];
  };
  const mandar = async (to: string[], subject: string, html: string, tag: string) => {
    if (to.length === 0) return;
    try { await admin.functions.invoke("send-notification-email", { body: { to, subject, html, tag } }); } catch { /* el registro ya quedó */ }
  };

  let tardNuevas = 0, camNuevas = 0;
  for (const c of candidatos) {
    const segs = segPor.get(c.user_id) ?? [];
    const presentes = segs.filter((s) => PRESENTE.has(s.estado));
    if (presentes.length === 0) continue; // no se conectó hoy → ausencia, no es esto
    const primeroMin = Math.min(...presentes.map((s) => s.ini));

    // ── 1) TARDANZA ──
    if (!avisadosTard.has(c.user_id) && nowMin >= c.entradaMin + c.tolerancia) {
      const tarde = primeroMin - c.entradaMin;
      if (tarde > c.tolerancia) {
        const emails = emailsDestino(c);
        const entroHHMM = `${String(Math.floor(primeroMin / 60)).padStart(2, "0")}:${String(primeroMin % 60).padStart(2, "0")}`;
        const entroISO = `${hoy}T${entroHHMM}:00-05:00`;
        const ins = await admin.from("tardanzas_registro").insert({
          tenant_id: c.tenant_id, user_id: c.user_id, dia: hoy, turno_nombre: c.turno_nombre,
          horario_asignado: c.entrada, entro_at: entroISO, tarde_min: tarde,
          tolerancia_min: c.tolerancia, correo_a: emails,
        }).select("id").single();
        if (!ins.error) {
          avisadosTard.add(c.user_id);
          await mandar(emails, `⏱ Entrada tarde — ${c.nombre} (+${tarde} min)`, correoTardanza({ nombre: c.nombre, rol: c.rol, horario: c.entrada.slice(0, 5), entro: entroHHMM, tardeMin: tarde }), "tardanza");
          await admin.from("tardanzas_registro").update({ correo_enviado: true, correo_enviado_at: new Date().toISOString() }).eq("id", ins.data.id);
          tardNuevas++;
        }
      }
    }

    // ── 2) SIN CÁMARA AL INICIO (solo si la ventana ya pasó y no está exonerado) ──
    if (!c.exento && !avisadosCam.has(c.user_id) && nowMin >= c.entradaMin + VENTANA_CAMARA_MIN + 2) {
      const vIni = c.entradaMin, vFin = c.entradaMin + VENTANA_CAMARA_MIN;
      const solapa = (s: Seg) => s.ini < vFin && s.fin > vIni;
      const presenteEnVentana = presentes.some(solapa);
      const camaraEnVentana = segs.some((s) => s.estado === "activo" && solapa(s));
      if (presenteEnVentana && !camaraEnVentana) {
        const emails = emailsDestino(c);
        const entroHHMM = `${String(Math.floor(primeroMin / 60)).padStart(2, "0")}:${String(primeroMin % 60).padStart(2, "0")}`;
        const entroISO = `${hoy}T${entroHHMM}:00-05:00`;
        const ins = await admin.from("camara_inicio_registro").insert({
          tenant_id: c.tenant_id, user_id: c.user_id, dia: hoy, turno_nombre: c.turno_nombre,
          horario_asignado: c.entrada, ventana_min: VENTANA_CAMARA_MIN, minutos_sin_camara: VENTANA_CAMARA_MIN,
          entro_at: entroISO, correo_a: emails,
        }).select("id").single();
        if (!ins.error) {
          avisadosCam.add(c.user_id);
          await mandar(emails, `📷 Sin cámara al inicio — ${c.nombre}`, correoCamara({ nombre: c.nombre, rol: c.rol, ventana: VENTANA_CAMARA_MIN, entro: entroHHMM }), "camara-inicio");
          await admin.from("camara_inicio_registro").update({ correo_enviado: true, correo_enviado_at: new Date().toISOString() }).eq("id", ins.data.id);
          camNuevas++;
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, candidatos: candidatos.length, tardNuevas, camNuevas, gracia, primerContacto }), { headers: { ...CORS, "Content-Type": "application/json" } });
});
