// Habla un anuncio con la VOZ ELEGIDA de la agencia (ElevenLabs, p. ej. Mario
// Deep), generada y cacheada en el servidor por la edge function `anuncio-tts`.
//
// Red de seguridad (igual de sagrada que en lib/voz.ts): si el servidor no puede
// —falta la clave de ElevenLabs, está caído, tarda demasiado— se cae a la voz
// del navegador (`hablar`). Un aviso de supervisión NUNCA debe quedar mudo.
//
// Antes de que el dueño ponga su clave de ElevenLabs, el servidor responde 503 y
// todo suena exactamente como hoy; además recordamos ese "sin clave" para no
// pedirle al servidor en cada aviso durante la misma sesión.

import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import { hablar } from "./voz";
import { CLIPS_VOZ } from "./clipsVoz";

/** Cuando el servidor dice que no hay clave, dejamos de preguntarle en esta
 *  sesión y vamos directo a la voz del navegador: nada de un round-trip ocioso
 *  por cada aviso. Se reinicia al recargar la página (por si ya pusieron la clave). */
let sinClaveEnServidor = false;

/** El audio que suena ahora: se corta antes de empezar el siguiente, como hace
 *  `hablar` con la síntesis, para que dos avisos no se encimen. */
let audioActual: HTMLAudioElement | null = null;

const TIMEOUT_MS = 8000;

/** Reproduce un audio (clip pregrabado o URL del servidor). Resuelve cuando
 *  ARRANCA; rechaza si no pudo (archivo/caché roto, autoplay bloqueado) para que
 *  el que llama caiga al servidor o a la voz del navegador. */
function reproducir(url: string, volumen?: number): Promise<void> {
  return new Promise((resolve, reject) => {
    try { audioActual?.pause(); } catch { /* noop */ }
    const a = new Audio(url);
    a.volume = volumen ?? 0.9;
    audioActual = a;
    a.onerror = () => reject(new Error("audio"));
    a.play().then(() => resolve()).catch(reject);
  });
}

export async function anunciar(texto: string, opciones?: { volumen?: number; voiceId?: string }): Promise<void> {
  const frase = (texto ?? "").trim();
  if (!frase) return;

  // 1) Audio pregrabado (voz Mario empacada con la app): no depende de clave,
  //    servidor ni internet. Si el texto tiene clip, suena ese y listo. PERO si
  //    se pidió una VOZ específica (voiceId), se salta el clip: el clip es Mario
  //    y aquí se quiere oír la otra voz (p. ej. probar una voz nueva de Argos).
  const clip = opciones?.voiceId ? undefined : CLIPS_VOZ[frase];
  if (clip) {
    try { await reproducir(clip, opciones?.volumen); return; }
    catch { /* si el clip falla, seguimos al servidor o al navegador */ }
  }

  if (sinClaveEnServidor) { hablar(frase, opciones); return; }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) { hablar(frase, opciones); return; }

    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(`${SUPABASE_URL}/functions/v1/anuncio-tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_PUBLISHABLE_KEY,
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ texto: frase, ...(opciones?.voiceId ? { voiceId: opciones.voiceId } : {}) }),
        signal: ctrl.signal,
      });
    } finally {
      window.clearTimeout(t);
    }

    if (resp.status === 503) { sinClaveEnServidor = true; hablar(frase, opciones); return; }
    if (!resp.ok) { hablar(frase, opciones); return; }

    const data = await resp.json() as { url?: string };
    if (!data.url) { hablar(frase, opciones); return; }

    try { audioActual?.pause(); } catch { /* noop */ }
    const a = new Audio(data.url);
    a.volume = opciones?.volumen ?? 0.9;
    audioActual = a;
    // Si el audio falla al cargar/reproducir, no quedamos mudos.
    a.onerror = () => { hablar(frase, opciones); };
    await a.play().catch(() => hablar(frase, opciones));
  } catch {
    // Cualquier cosa (sin red, abortado por timeout, etc.): voz del navegador.
    hablar(frase, opciones);
  }
}
