// anuncio-tts — convierte un texto en audio hablado con la voz elegida de
// ElevenLabs (Mario Deep por defecto) y lo CACHEA en el bucket 'anuncios-voz'
// por hash de (voz + texto). La segunda vez que alguien pide la misma frase no
// se vuelve a generar ni a pagar: se devuelve el audio guardado.
//
// Seguridad: pide JWT válido (usuario logueado). La clave de ElevenLabs vive en
// el secreto ELEVENLABS_API_KEY del proyecto; si falta, responde 503 y el
// frontend cae a la voz del navegador (nunca queda mudo).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "anuncios-voz";
const VOZ_DEFECTO = "tomkxGQGz4b1kE0EM722"; // Mario - Animated and chatty (elegida por Alvaro)
const MODELO = "eleven_multilingual_v2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const XI_KEY = Deno.env.get("ELEVENLABS_API_KEY");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Usuario (para resolver su agencia y su voz configurada).
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "No autenticado" }, 401);

  let body: { texto?: string; voiceId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const texto = String(body.texto ?? "").trim();
  if (!texto) return json({ error: "Falta el texto" }, 400);
  if (texto.length > 500) return json({ error: "Texto demasiado largo" }, 400);

  // Voz: la que pida el frontend, o la configurada por la agencia, o Mario Deep.
  let voiceId = (body.voiceId ?? "").trim();
  if (!voiceId) {
    const { data: tm } = await admin.from("tenant_members")
      .select("tenant_id").eq("user_id", user.id).limit(1).maybeSingle();
    if (tm?.tenant_id) {
      const { data: cfg } = await admin.from("announcement_overrides")
        .select("voice_id").eq("tenant_id", tm.tenant_id).maybeSingle();
      voiceId = cfg?.voice_id ?? VOZ_DEFECTO;
    } else {
      voiceId = VOZ_DEFECTO;
    }
  }

  const hash = await sha256Hex(`${voiceId}|${MODELO}|${texto}`);
  const fileName = `${hash}.mp3`;

  // ¿Ya está cacheado? Si sí, se devuelve sin re-generar.
  const { data: yaExiste } = await admin.storage.from(BUCKET).download(fileName);
  if (yaExiste) {
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(fileName);
    return json({ url: pub.publicUrl, cached: true });
  }

  // Generar con ElevenLabs.
  if (!XI_KEY) {
    console.error("[anuncio-tts] falta el secreto ELEVENLABS_API_KEY");
    return json({ error: "no-key", detalle: "Falta el secreto ELEVENLABS_API_KEY" }, 503);
  }
  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": XI_KEY,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg",
    },
    body: JSON.stringify({
      text: texto,
      model_id: MODELO,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!resp.ok) {
    const detalle = await resp.text().catch(() => "");
    // Log para diagnosticar POR QUÉ ElevenLabs rechaza (voz inexistente, llave
    // inválida, cuota agotada): el status y el cuerpo quedan en function_logs.
    console.error("[anuncio-tts] ElevenLabs rechazó", resp.status, "voiceId:", voiceId, "detalle:", detalle.slice(0, 400));
    return json({ error: "elevenlabs", status: resp.status, detalle: detalle.slice(0, 300) }, 502);
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());

  const { error: upErr } = await admin.storage.from(BUCKET)
    .upload(fileName, bytes, { contentType: "audio/mpeg", upsert: true });
  if (upErr) return json({ error: "upload", detalle: upErr.message }, 500);

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(fileName);
  return json({ url: pub.publicUrl, cached: false });
});
