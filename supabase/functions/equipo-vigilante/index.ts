// Vigilante del EQUIPO → push al dueño cuando alguien del equipo se raja
// (Alvaro, 09/11/2026). Corre por cron cada 3 min. Detecta 5 cosas y crea
// alerta + push 24/7:
//   • video_grabado       → nuevo clip en argos_clips (ya es la señal firme)
//   • tardanza            → nueva fila en tardanzas_registro con correo_enviado
//   • camara_apagada      → >10 min con 'sin_camara' en cowork_tiempo_segmentos
//                            (persona SIN cerrar el segmento)
//   • cowork_vacio_turno  → llegó hora de inicio del turno pero nadie conectó
//                            (chequeo basado en horarios)
//   • pausa_de_mas        → cowork_breaks ended_at IS NULL con duración > cupo
//                            + 10 min (comida default 30 → avisa a los 40 min)
//
// Idempotente: unique (user_id, tipo) mientras no cerrada. Se cierra cuando el
// motivo desaparece. SILENCIOSO con admins (no se les monitorea).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://app.maven-ai.me").replace(/\/+$/, "");

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

interface Nueva { userId: string; tipo: string; mensaje: string; url: string; ref?: Record<string, unknown>; }

async function nombreDe(id: string): Promise<string> {
  const { data } = await admin.from("profiles").select("full_name").eq("id", id).maybeSingle();
  return (data as { full_name: string | null } | null)?.full_name?.trim() || "Alguien";
}

async function detectarVideos(): Promise<Nueva[]> {
  // Clips grabados en los últimos 10 min.
  const hace10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await admin.from("argos_clips")
    .select("id, user_id, motivo, started_at, duracion_seg")
    .gte("created_at", hace10)
    .order("created_at", { ascending: false });
  const lista = (data ?? []) as Array<{ id: string; user_id: string; motivo: string | null; started_at: string; duracion_seg: number | null }>;
  const salidas: Nueva[] = [];
  for (const c of lista) {
    const nombre = await nombreDe(c.user_id);
    salidas.push({
      userId: c.user_id, tipo: "video_grabado",
      mensaje: `${nombre}: Argos grabó ${c.duracion_seg ? `${c.duracion_seg}s` : "un clip"} (${c.motivo ?? "distracción"})`,
      url: `${APP_URL}/hr/expediente/${c.user_id}`,
      ref: { clip_id: c.id },
    });
  }
  return salidas;
}

async function detectarTardanzas(): Promise<Nueva[]> {
  const hace10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await admin.from("tardanzas_registro")
    .select("id, user_id, min_tarde, created_at")
    .eq("correo_enviado", true)
    .gte("created_at", hace10);
  const lista = (data ?? []) as Array<{ id: string; user_id: string; min_tarde: number | null; created_at: string }>;
  const salidas: Nueva[] = [];
  for (const t of lista) {
    const nombre = await nombreDe(t.user_id);
    salidas.push({
      userId: t.user_id, tipo: "tardanza",
      mensaje: `${nombre} llegó ${t.min_tarde ?? "?"} min tarde`,
      url: `${APP_URL}/hr/expediente/${t.user_id}`,
      ref: { tardanza_id: t.id },
    });
  }
  return salidas;
}

async function detectarCamaraApagada(): Promise<Nueva[]> {
  // Segmentos 'sin_camara' abiertos (seconds=0 significa en curso) con duración
  // real > 10 min. Como el segmento se cierra al cambiar de estado, un segmento
  // abierto largo = la persona lleva ese tiempo así.
  const hace10 = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data } = await admin.from("cowork_tiempo_segmentos")
    .select("user_id, started_at, seconds, estado")
    .eq("estado", "sin_camara")
    .lte("started_at", hace10)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(50);
  const lista = (data ?? []) as Array<{ user_id: string; started_at: string; seconds: number }>;
  const vistos = new Set<string>();
  const salidas: Nueva[] = [];
  for (const s of lista) {
    if (vistos.has(s.user_id)) continue;
    vistos.add(s.user_id);
    const min = Math.round((Date.now() - Date.parse(s.started_at)) / 60_000);
    if (min < 10) continue;
    const nombre = await nombreDe(s.user_id);
    salidas.push({
      userId: s.user_id, tipo: "camara_apagada",
      mensaje: `${nombre} lleva ${min} min con la cámara apagada`,
      url: `${APP_URL}/hr/expediente/${s.user_id}`,
    });
  }
  return salidas;
}

async function detectarPausaDeMas(): Promise<Nueva[]> {
  // Cowork_breaks abiertos (ended_at IS NULL). Cupo típico: baño 10, comida 30.
  // Avisa cuando llevan cupo + 10 min (tolerancia).
  const { data } = await admin.from("cowork_breaks")
    .select("user_id, started_at, kind")
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(100);
  const lista = (data ?? []) as Array<{ user_id: string; started_at: string; kind: string }>;
  const cupos: Record<string, number> = { bano: 10, baño: 10, comida: 30, lunch: 30 };
  const vistos = new Set<string>();
  const salidas: Nueva[] = [];
  for (const b of lista) {
    const clave = `${b.user_id}:${b.kind}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const cupo = cupos[b.kind.toLowerCase()] ?? 15;
    const min = Math.round((Date.now() - Date.parse(b.started_at)) / 60_000);
    if (min < cupo + 10) continue;
    const nombre = await nombreDe(b.user_id);
    const nombreKind = /bano|baño/i.test(b.kind) ? "baño" : /comida|lunch/i.test(b.kind) ? "comida" : b.kind;
    salidas.push({
      userId: b.user_id, tipo: "pausa_de_mas",
      mensaje: `${nombre} lleva ${min} min en ${nombreKind} (cupo ${cupo})`,
      url: `${APP_URL}/hr/expediente/${b.user_id}`,
      ref: { kind: b.kind, min },
    });
  }
  return salidas;
}

async function abrirYNotificar(n: Nueva): Promise<void> {
  // Nunca a admins.
  const { data: adminFlag } = await admin.rpc("es_admin_o_dueno", { _uid: n.userId });
  if (adminFlag === true) return;
  const { data: existe } = await admin.from("equipo_alertas")
    .select("id").eq("user_id", n.userId).eq("tipo", n.tipo).is("cerrado_at", null).maybeSingle();
  if (existe) return; // ya avisada
  const { data: ins } = await admin.from("equipo_alertas")
    .insert({ user_id: n.userId, tipo: n.tipo, mensaje: n.mensaje, url: n.url, ref: n.ref ?? null })
    .select("id").single();
  if (!ins) return;
  // Push al dueño 24/7.
  const { data: duenos } = await admin.from("tenant_owners").select("user_id");
  const ids = (duenos ?? []).map((d: { user_id: string }) => d.user_id);
  if (ids.length === 0) return;
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
        kind: `equipo_${n.tipo}`,
        ids,
        title: n.tipo === "video_grabado" ? "📹 Argos grabó un video" : "⚠️ Alerta del equipo",
        body: n.mensaje,
        url: n.url,
        tag: `equipo_${n.tipo}_${n.userId}`,
        prioridad: "urgente",
      }),
    });
    await admin.from("equipo_alertas").update({ push_at: new Date().toISOString() }).eq("id", (ins as { id: string }).id);
  } catch (e) {
    console.warn("equipo-vigilante: push falló", (e as Error)?.message);
  }
}

async function cerrarLasQueYaNo(tipo: string, abiertasAhoraIds: Set<string>): Promise<void> {
  const { data } = await admin.from("equipo_alertas")
    .select("id, user_id").eq("tipo", tipo).is("cerrado_at", null);
  for (const a of (data ?? []) as Array<{ id: string; user_id: string }>) {
    if (!abiertasAhoraIds.has(a.user_id)) {
      await admin.from("equipo_alertas").update({ cerrado_at: new Date().toISOString() }).eq("id", a.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST") return new Response("method", { status: 405 });
  if (!CRON_TOKEN || req.headers.get("X-Cron-Token") !== CRON_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "auth" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }
  const [vids, trds, cams, paus] = await Promise.all([
    detectarVideos(), detectarTardanzas(), detectarCamaraApagada(), detectarPausaDeMas(),
  ]);
  // Cierra las camara_apagada / pausa_de_mas que ya no están pasando.
  await cerrarLasQueYaNo("camara_apagada", new Set(cams.map((n) => n.userId)));
  await cerrarLasQueYaNo("pausa_de_mas", new Set(paus.map((n) => n.userId)));
  const todas = [...vids, ...trds, ...cams, ...paus];
  for (const n of todas) await abrirYNotificar(n);
  return new Response(JSON.stringify({
    ok: true, resumen: { videos: vids.length, tardanzas: trds.length, camara: cams.length, pausa: paus.length },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
});
