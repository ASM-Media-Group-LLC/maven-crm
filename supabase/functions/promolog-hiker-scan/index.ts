import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authorizeCronOrJwt, whatsappCors } from "../_shared/whatsapp.ts";

// promolog-hiker-scan — lee historias de IG vía HikerAPI (proxies + cuentas
// gestionadas por ellos → sin el UPSTREAM504 del proxy CO de Apify ni sesión
// nuestra que se queme). SPIKE inicial: solo trae la respuesta cruda de
// /v1/user/stories/by/username para inspeccionar el formato antes de cablear el
// parser + el análisis IA (que se reusa del webhook). NO escribe nada aún.
//
// Auth: X-Cron-Token o JWT admin (authorizeCronOrJwt). Deploy --no-verify-jwt.

const HIKER_BASE = "https://api.hikerapi.com";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });
  if (!authorizeCronOrJwt(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const key = Deno.env.get("HIKER_API_KEY");
  if (!key) return json({ ok: false, error: "HIKER_API_KEY no seteado" }, 500);

  const body = await req.json().catch(() => ({})) as { handles?: string[] };
  const handles = Array.isArray(body.handles) ? body.handles.slice(0, 25) : [];
  if (!handles.length) return json({ ok: false, error: "pasa { handles: [...] }" }, 400);

  const tally = { read_stories: 0, read_empty: 0, user_not_found: 0, insufficient_funds: 0, other: 0 };
  const results: unknown[] = [];
  for (const h of handles) {
    const url = `${HIKER_BASE}/v1/user/stories/by/username?username=${encodeURIComponent(h)}`;
    const t0 = Date.now();
    try {
      const resp = await fetch(url, { headers: { accept: "application/json", "x-access-key": key } });
      const txt = await resp.text();
      let parsed: unknown = txt;
      try { parsed = JSON.parse(txt); } catch { /* deja el texto */ }
      const arr = Array.isArray(parsed) ? parsed : null;
      let note = `status ${resp.status}`;
      if (resp.status === 200 && arr) {
        if (arr.length > 0) { tally.read_stories++; note = `stories:${arr.length}`; }
        else { tally.read_empty++; note = "leyó, 0 stories"; }
      } else if (resp.status === 404) { tally.user_not_found++; note = "UserNotFound"; }
      else if (resp.status === 402) { tally.insufficient_funds++; note = "InsufficientFunds"; }
      else { tally.other++; }
      results.push({ handle: h, status: resp.status, ms: Date.now() - t0, count: arr ? arr.length : null, note });
    } catch (e) {
      tally.other++;
      results.push({ handle: h, error: (e as Error).message, ms: Date.now() - t0 });
    }
  }
  return json({ ok: true, tally, results });
});
