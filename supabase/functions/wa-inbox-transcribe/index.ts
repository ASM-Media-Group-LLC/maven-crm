import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, resolveMimeType, whatsappCors } from "../_shared/whatsapp.ts";
import { buildGlossary, type Glossary } from "../_shared/whisper-glossary.ts";

// wa-inbox-transcribe — transcribe los AUDIOS de la BANDEJA (wa_conversation_messages)
// con el Whisper self-hosted de Dokploy, y escribe el texto en `body`.
//
// A diferencia del bot del grupo (whatsapp_messages, media efímera ~5min), la media
// de la bandeja se sube a Supabase Storage con URL firmada de 1 año (ver
// whatsapp-ingest/downloadAndStoreInboundMedia) → es PERSISTENTE, así que esto
// backfillea audios viejos Y procesa los nuevos. Modo batch (cron) o single (message_id).
//
// Idempotente: solo toma audios con body NULL (placeholder). Éxito → body=texto;
// fallo permanente → body marcado para no reintentar en loop. Whisper self-hosted = $0.
// El bot lee `body` vía la tool get_model_whatsapp_context (ya no marca "[sin transcribir]").

const WHISPER_URL = Deno.env.get("WHISPER_API_URL") ?? "";
const WHISPER_KEY = Deno.env.get("WHISPER_API_KEY") ?? "";
const WHISPER_MODEL = Deno.env.get("WHISPER_API_MODEL") ?? "deepdml/faster-whisper-large-v3-turbo-ct2";
const TIMEOUT_MS = 90_000;
const MAX_BYTES = 25 * 1024 * 1024;

// Una vez por cold start: jerga + equipo + creadoras activas (acá se habla CON
// creadoras, sus nombres aparecen todo el tiempo). Sin grupo del bot → sin
// miembros dinámicos. Si la query falla, cae al glosario fijo (nunca bloquea).
const GLOSSARY = await buildGlossary(adminClient(), null);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...whatsappCors, "Content-Type": "application/json" } });
}

async function transcribe(blob: Blob, glossary: Glossary): Promise<{ text: string } | { error: string }> {
  if (!WHISPER_URL) return { error: "WHISPER_API_URL_not_set" };
  const ext = (blob.type || "").includes("mp4") || (blob.type || "").includes("m4a") ? "m4a" : "ogg";
  const form = new FormData();
  form.append("file", new File([blob], `wa_audio.${ext}`, { type: blob.type || "audio/ogg" }));
  form.append("model", WHISPER_MODEL);
  form.append("language", "es");
  form.append("response_format", "verbose_json");
  form.append("temperature", "0");
  // Glosario (jerga + equipo + creadoras): acá no hay grupo del bot, así que va
  // sin miembros dinámicos. hotwords es de speaches — esta función SOLO habla con
  // el self-host, así que se manda siempre (el server viejo lo ignora).
  if (glossary.prompt) form.append("prompt", glossary.prompt);
  if (glossary.hotwords) form.append("hotwords", glossary.hotwords);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(WHISPER_URL, {
      method: "POST",
      headers: WHISPER_KEY ? { Authorization: `Bearer ${WHISPER_KEY}` } : {},
      body: form,
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { error: `whisper ${r.status}: ${(await r.text().catch(() => "")).slice(0, 150)}` };
    const d = (await r.json()) as { text?: string };
    const text = (d.text ?? "").trim();
    return text ? { text } : { error: "empty_transcript" };
  } catch (e) {
    clearTimeout(t);
    return { error: (e as Error).name === "AbortError" ? "whisper_timeout" : (e as Error).message };
  }
}

// deno-lint-ignore no-explicit-any
async function processOne(sb: any, row: { id: string; media_url: string }): Promise<boolean> {
  const mark = (txt: string) => sb.from("wa_conversation_messages").update({ body: txt }).eq("id", row.id);
  try {
    const resp = await fetch(row.media_url);
    if (!resp.ok) { await mark(`[audio no transcribible: descarga ${resp.status}]`); return false; }
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) { await mark("[audio no transcribible: tamaño]"); return false; }
    const mime = resolveMimeType(resp.headers.get("content-type"), buf, "audio/ogg");
    const res = await transcribe(new Blob([buf], { type: mime }), GLOSSARY);
    if ("error" in res) {
      console.warn("transcribe failed", row.id, res.error);
      // Solo marcamos permanente si NO es transitorio (timeout/red) — esos reintentan.
      if (!/timeout|fetch|network|whisper 5\d\d/i.test(res.error)) await mark("[audio no transcribible]");
      return false;
    }
    await sb.from("wa_conversation_messages").update({ body: res.text }).eq("id", row.id);
    return true;
  } catch (e) {
    console.warn("processOne error", row.id, (e as Error).message);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await req.json().catch(() => ({})) as { message_id?: string; batch_size?: number };
  const sb = adminClient();

  if (body.message_id) {
    const { data: row } = await sb
      .from("wa_conversation_messages").select("id, media_url")
      .eq("id", body.message_id).maybeSingle();
    if (!row?.media_url) return json({ ok: false, reason: "no_media" });
    const ok = await processOne(sb, row as { id: string; media_url: string });
    return json({ ok, processed: 1, transcribed: ok ? 1 : 0 });
  }

  // Batch: audios de la bandeja SIN transcribir con media en Storage. "Sin transcribir" =
  // body IS NULL (algunas ingestas dejan null) O body = '[audio]' (otras ingestas —p.ej. la
  // línea de Managers— insertan ese placeholder literal). Antes solo tomaba `is null` y se
  // saltaba TODOS los '[audio]' → nunca se transcribían y el bot decía "audio sin transcribir".
  // OJO: match EXACTO a '[audio]' — NO reprocesar '[audio no transcribible]' (evita loop).
  const limit = Math.min(body.batch_size ?? 10, 25);
  const { data: rows } = await sb
    .from("wa_conversation_messages")
    .select("id, media_url")
    .eq("msg_type", "audio")
    .not("media_url", "is", null)
    .or("body.is.null,body.eq.[audio]")
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(limit);

  // Presupuesto de tiempo (wall-clock): la edge function la mata la plataforma a los
  // ~150s (devuelve 504, desperdicia el lote y congestiona pg_net). El timeout por-audio
  // es 90s, así que NO arrancamos un audio nuevo si ya pasaron 55s (peor caso 55+90=145s
  // < 150). Mantenemos el timeout por-audio en 90s para NO abandonar audios largos
  // legítimos (evita crear "poison"). Lo que no entra en el presupuesto lo toma el
  // próximo tick del cron. [fix incidente pg_net 2026-06-19]
  const startedAt = Date.now();
  const START_BUDGET_MS = 55_000;
  let ok = 0, attempted = 0;
  for (const r of (rows ?? []) as Array<{ id: string; media_url: string }>) {
    if (Date.now() - startedAt > START_BUDGET_MS) break;
    attempted++;
    if (await processOne(sb, r)) ok++;
  }
  return json({ ok: true, fetched: (rows ?? []).length, attempted, transcribed: ok });
});
