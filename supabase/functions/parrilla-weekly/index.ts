// parrilla-weekly — F2 de la Parrilla: la semana sale sola.
//
// Dos entradas, un mismo flujo:
//   · CRON (jueves 10:00 Bogotá, X-Cron-Token): si no existe la parrilla del ciclo
//     que arranca hoy, la crea copiando la estructura de la anterior y la redacta
//     con IA (misma pieza que el botón "Generar con IA", aprende del feedback).
//   · BOTÓN "Enviar al grupo" (JWT de una manager con la función 'Enviar al grupo'):
//     manda la parrilla indicada tal como está.
// Después, para ambas: renderiza el PDF con Gotenberg, lo guarda en Storage
// (content_grids.pdf_url) y lo manda al grupo Managers de WhatsApp como documento
// con un mensaje corto; la parrilla pasa a 'enviada' (congelada: trigger
// parrilla_guard_enviada + UI solo lectura).
//
// Gate del cron: app_flags 'parrilla_weekly_live'. Apagado → hace todo menos el
// envío (la parrilla igual queda creada en Maven, con su PDF). body.dry_run:true
// fuerza lo mismo desde cualquiera de las dos entradas.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsFor } from "../_shared/cors.ts";
import { IaError, aplicarRedaccion, redactarParrilla } from "../parrilla-generate/ia.ts";
import { A3_LANDSCAPE_IN, renderParrillaHtml } from "./html.ts";

const corsHeaders = (req: Request) =>
  corsFor(req, { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token" });

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.maven-ai.me").replace(/\/$/, "");
// Grupo Managers (whatsapp_groups). Override sin redeploy: PARRILLA_WA_GROUP_ID.
const GROUP_ID = Deno.env.get("PARRILLA_WA_GROUP_ID") ?? "73a4414e-2546-4ca7-9289-7cbec70b0273";
const BUCKET = "parrilla-pdfs";
const FLAG = "parrilla_weekly_live";

const admin = () => createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const hoyBogota = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};

class HttpError extends Error { constructor(message: string, public status: number) { super(message); } }

// Credenciales de Gotenberg: env si están, si no el Vault (RPC internal_secret,
// solo service_role). Mismo servidor que se levantó en Dokploy el 27/08.
async function gotenbergCreds(sb: SupabaseClient) {
  const fromEnv = { url: Deno.env.get("GOTENBERG_URL"), user: Deno.env.get("GOTENBERG_USER"), pass: Deno.env.get("GOTENBERG_PASS") };
  if (fromEnv.url && fromEnv.user && fromEnv.pass) return fromEnv as { url: string; user: string; pass: string };
  const get = async (name: string) => {
    const { data, error } = await sb.rpc("internal_secret", { p_name: name });
    if (error) throw new HttpError(`No pude leer el secreto ${name}: ${error.message}`, 500);
    return String(data ?? "");
  };
  const creds = { url: await get("gotenberg_url"), user: await get("gotenberg_user"), pass: await get("gotenberg_pass") };
  if (!creds.url || !creds.user || !creds.pass) throw new HttpError("Gotenberg sin credenciales configuradas", 500);
  return creds;
}

async function renderPdf(sb: SupabaseClient, html: string): Promise<Uint8Array> {
  const { url, user, pass } = await gotenbergCreds(sb);
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  form.append("paperWidth", String(A3_LANDSCAPE_IN.width));
  form.append("paperHeight", String(A3_LANDSCAPE_IN.height));
  for (const m of ["marginTop", "marginBottom", "marginLeft", "marginRight"]) form.append(m, "0.3");
  form.append("printBackground", "true");
  // Una sola página: la altura crece con el contenido, nunca se corta una columna.
  form.append("singlePage", "true");
  const resp = await fetch(`${url.replace(/\/$/, "")}/forms/chromium/convert/html`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${user}:${pass}`) },
    body: form,
  });
  if (!resp.ok) throw new HttpError(`Gotenberg respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}`, 502);
  return new Uint8Array(await resp.arrayBuffer());
}

// Crea la parrilla del ciclo que arranca hoy (jueves → jueves, 8 días) copiando la
// plantilla de la última parrilla: apertura al día 1, cierre al último, el medio
// por día de semana — el mismo mapeo que "Nueva semana" en el editor.
async function crearSemana(sb: SupabaseClient, start: string, end: string) {
  const { data: prev } = await sb
    .from("content_grids")
    .select("id, title, theme")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: tpl } = prev
    ? await sb.from("content_grid_days").select("*").eq("grid_id", prev.id).order("day_index")
    : { data: [] as any[] };

  const { data: g, error } = await sb
    .from("content_grids")
    .insert({ week_start: start, week_end: end, status: "borrador", title: prev?.title ?? "Parrilla de promoción", theme: prev?.theme ?? null })
    .select("id, week_start, week_end")
    .single();
  if (error) throw error;

  const nDias = Math.round((new Date(end + "T12:00:00Z").getTime() - new Date(start + "T12:00:00Z").getTime()) / 86400000) + 1;
  const dias = tpl ?? [];
  const apertura = dias[0] ?? null;
  const cierre = dias.length > 1 ? dias[dias.length - 1] : null;
  const porWeekday = new Map<number, any>();
  for (const d of dias.slice(1, Math.max(dias.length - 1, 1))) {
    const w = new Date(d.date + "T12:00:00Z").getUTCDay();
    if (!porWeekday.has(w)) porWeekday.set(w, d);
  }
  const vacio = (i: number) => ({
    day_index: i, format_badge: "flyer_foto", idea: "", copy_sugerido: "", franja: "11:00 - 13:00", franja_start: "11:00", franja_end: "13:00",
    extra_type: "custom", extra_title: "", extra_desc: "", extra_items: [], refs: [],
  });
  const rows = Array.from({ length: nDias }, (_, i) => {
    const date = addDays(start, i);
    const w = new Date(date + "T12:00:00Z").getUTCDay();
    const source = i === 0 ? apertura : (i === nDias - 1 ? (cierre ?? porWeekday.get(w) ?? null) : porWeekday.get(w) ?? null);
    const { id: _id, grid_id: _g, created_at: _c, updated_at: _u, ...base } = source ?? vacio(i + 1);
    return { ...base, grid_id: g.id, day_index: i + 1, date };
  });
  const { error: dErr } = await sb.from("content_grid_days").insert(rows);
  if (dErr) throw dErr;
  const { error: tErr } = await sb.rpc("parrilla_derive_tasks", { p_grid_id: g.id });
  if (tErr) throw tErr;
  return g as { id: string; week_start: string; week_end: string };
}

serve(async (req) => {
  const headers = { ...corsHeaders(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  try {
    const body = await req.json().catch(() => ({})) as { grid_id?: string; dry_run?: boolean; regenerar?: boolean };
    const sb = admin();

    // ── Auth: cron interno o manager con la función 'Enviar al grupo' ──────────
    const esCron = !!CRON_TOKEN && req.headers.get("X-Cron-Token") === CRON_TOKEN;
    let actor = "cron";
    if (!esCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
      const { data: u, error: uErr } = await asUser.auth.getUser();
      if (uErr || !u?.user) throw new HttpError("Sesión inválida", 401);
      const { data: puede, error: pErr } = await asUser.rpc("can_use_module_function", {
        _user_id: u.user.id, _module: "Parrilla", _submodule: "Enviar al grupo", _fallback_group: "manager",
      });
      if (pErr) throw pErr;
      if (!puede) throw new HttpError("No tienes permiso para enviar la parrilla al grupo", 403);
      if (!body.grid_id) throw new HttpError("grid_id requerido", 400);
      actor = u.user.id;
    }

    // ── La parrilla objetivo ───────────────────────────────────────────────────
    let grid: { id: string; week_start: string; week_end: string; status: string; title: string; theme: any; pdf_url: string | null } | null = null;
    let creada = false;
    let redactada = false;
    if (body.grid_id) {
      const { data, error } = await sb.from("content_grids").select("id, week_start, week_end, status, title, theme, pdf_url").eq("id", body.grid_id).maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError("Parrilla no encontrada", 404);
      grid = data;
    } else {
      const hoy = hoyBogota();
      const { data, error } = await sb.from("content_grids").select("id, week_start, week_end, status, title, theme, pdf_url").eq("week_start", hoy).maybeSingle();
      if (error) throw error;
      if (data) {
        grid = data;
      } else {
        const g = await crearSemana(sb, hoy, addDays(hoy, 7));
        creada = true;
        const { data: full } = await sb.from("content_grids").select("id, week_start, week_end, status, title, theme, pdf_url").eq("id", g.id).single();
        grid = full!;
      }
    }
    if (!grid) throw new HttpError("Sin parrilla", 500);

    if (grid.status === "enviada" && !body.dry_run) {
      // El cron reintentado no manda dos veces; el botón avisa.
      if (esCron) return new Response(JSON.stringify({ ok: true, skipped: "ya_enviada", grid_id: grid.id }), { headers });
      throw new HttpError("Esta parrilla ya fue enviada. Vuelve a borrador para reenviarla.", 409);
    }

    const { data: days, error: dErr } = await sb.from("content_grid_days").select("*").eq("grid_id", grid.id).order("day_index");
    if (dErr) throw dErr;
    if (!days?.length) throw new HttpError("La parrilla no tiene días", 400);

    // ── Redacción con IA: solo cuando el cron la acaba de crear (o se pide) ────
    if (creada || body.regenerar) {
      const { generados, model } = await redactarParrilla(sb, grid, days, { origen: esCron ? "cron" : "boton_enviar", actor });
      await aplicarRedaccion(sb, grid.id, days, generados, model);
      redactada = true;
      const { data: fresh } = await sb.from("content_grid_days").select("*").eq("grid_id", grid.id).order("day_index");
      days.splice(0, days.length, ...(fresh ?? []));
    }

    // ── PDF con Gotenberg → Storage → pdf_url ─────────────────────────────────
    const html = renderParrillaHtml({ title: grid.title, week_start: grid.week_start, week_end: grid.week_end, theme: grid.theme, days });
    const pdf = await renderPdf(sb, html);
    const path = `${grid.week_start}/parrilla-${grid.week_start}-${Date.now()}.pdf`;
    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new HttpError(`No pude guardar el PDF: ${upErr.message}`, 500);
    const pdfUrl = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    await sb.from("content_grids").update({ pdf_url: pdfUrl }).eq("id", grid.id);

    // ── Envío al grupo (gate del cron: app_flags) ──────────────────────────────
    let live = true;
    if (esCron) {
      const { data: flag } = await sb.from("app_flags").select("enabled").eq("key", FLAG).maybeSingle();
      live = flag?.enabled === true;
    }
    const dryRun = body.dry_run === true || !live;
    const nDias = days.length;
    const mensaje =
      `📋 *Parrilla de promoción · ${fmtDia(grid.week_start)} → ${fmtDia(grid.week_end)}* (${nDias} días)\n` +
      `Ya está en Maven: ${APP_URL}/parrilla\n\n` +
      `Revísenla y dejen su feedback debajo del tablero: con eso se redacta la de la semana siguiente. ` +
      `Si hay que corregir algo: "Volver a borrador", editan y la reenvían con "Enviar al grupo".`;
    const fileName = `Parrilla ${fmtDia(grid.week_start).replace("/", "-")} a ${fmtDia(grid.week_end).replace("/", "-")}.pdf`;

    let enviado = false;
    if (!dryRun) {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Cron-Token": CRON_TOKEN },
        body: JSON.stringify({ group_id: GROUP_ID, body: mensaje, document_url: pdfUrl, file_name: fileName, mimetype: "application/pdf" }),
      });
      const out = await resp.json().catch(() => ({}));
      if (!resp.ok || !out?.ok) throw new HttpError(`WhatsApp no aceptó el envío: ${out?.error ?? resp.status}`, 502);
      enviado = true;
      const { error: stErr } = await sb.from("content_grids").update({ status: "enviada", sent_at: new Date().toISOString() }).eq("id", grid.id);
      if (stErr) throw stErr;
    }

    return new Response(JSON.stringify({
      ok: true, grid_id: grid.id, week_start: grid.week_start, week_end: grid.week_end,
      creada, redactada, pdf_url: pdfUrl, enviado, dry_run: dryRun, live, mensaje,
    }), { headers });
  } catch (e) {
    console.error("parrilla-weekly error", e);
    const status = e instanceof HttpError || e instanceof IaError ? e.status : 500;
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status, headers });
  }
});
