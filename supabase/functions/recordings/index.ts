// Grabaciones de Meet y Cowork.
//
// El circuito: `start` le pide a LiveKit Egress que se una a la sala como
// participante invisible y componga un MP4 en el disco del VPS
// (/var/lib/maven/grabaciones, montado en el compose de infra/livekit).
// `stop` detiene el egress, espera el cierre del archivo, guarda tamaño y
// duración, registra a quiénes se comparte y les manda el link por correo.
// `download` firma URLs de descarga que VENCEN (10 min) contra rec-server.
// `expire` corre por cron: borra los archivos vencidos (90 días, sin
// excepciones — es lo que hace viable el disco del VPS) y recién después
// marca las filas.
//
// PERMISOS: start/stop cualquier usuario autenticado que esté en la sala
// (el frontend solo lo ofrece dentro de la llamada); download/delete se
// verifican acá contra la MISMA regla del RLS (dueño, destinatario o
// admin) — el service_role bypassa RLS, así que el chequeo es explícito.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EgressClient, EncodedFileOutput, EncodedFileType } from "https://esm.sh/livekit-server-sdk@2.9.2";
import { buildMessage, SmtpClient } from "../_shared/smtp.ts";
import { unseal } from "../_shared/mail-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-token",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** LIVEKIT_URL viene como wss:// (para el navegador); la API Twirp del
 *  mismo servidor vive en https://. */
function livekitHttpUrl(): string {
  const raw = Deno.env.get("LIVEKIT_URL") ?? "";
  return raw.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

function egress(): EgressClient {
  return new EgressClient(
    livekitHttpUrl(),
    Deno.env.get("LIVEKIT_API_KEY")!,
    Deno.env.get("LIVEKIT_API_SECRET")!,
  );
}

/** Firma para rec-server: HMAC(archivo.exp). El link vence solo. */
async function firmarUrl(archivo: string, accion: "d" | "f" | "stat", vidaSegundos: number): Promise<string> {
  const secret = Deno.env.get("RECORDINGS_SIGNING_SECRET")!;
  const base = Deno.env.get("RECORDINGS_BASE_URL")!; // https://rec.asmtech.ai
  const exp = Math.floor(Date.now() / 1000) + vidaSegundos;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${archivo}.${exp}`));
  const sig = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${base}/${accion}/${archivo}?exp=${exp}&sig=${sig}`;
}

/** ¿Puede este usuario tocar esta grabación? La MISMA regla que el RLS,
 *  repetida acá porque el service_role no pasa por RLS. */
// deno-lint-ignore no-explicit-any
async function puedeVer(admin: any, userId: string, rec: { id: string; started_by: string }): Promise<boolean> {
  if (rec.started_by === userId) return true;
  const { data: dest } = await admin
    .from("meeting_recording_recipients")
    .select("user_id").eq("recording_id", rec.id).eq("user_id", userId).maybeSingle();
  if (dest) return true;
  const { data: rol } = await admin
    .from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  return !!rol;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { action } = body as { action?: string };
    if (!action) return json({ error: "action is required" }, 400);

    // === EXPIRE (cron, sin usuario) ===
    if (action === "expire") {
      const token = req.headers.get("x-cron-token");
      if (!token || token !== Deno.env.get("RECORDINGS_CRON_TOKEN")) {
        return json({ error: "Unauthorized" }, 401);
      }
      const { data: vencidas, error } = await admin.rpc("expire_meeting_recordings");
      if (error) return json({ error: error.message }, 500);

      let borradas = 0;
      const fallas: string[] = [];
      for (const v of (vencidas ?? []) as Array<{ id: string; storage_key: string }>) {
        try {
          if (v.storage_key) {
            const url = await firmarUrl(v.storage_key, "f", 60);
            const r = await fetch(url, { method: "DELETE" });
            // 404 = el archivo ya no está: marcarla igual, no es huérfano.
            if (!r.ok && r.status !== 404) throw new Error(`rec-server ${r.status}`);
          }
          await admin.from("meeting_recordings")
            .update({ deleted_at: new Date().toISOString(), status: "deleted" })
            .eq("id", v.id);
          borradas++;
        } catch (e) {
          fallas.push(`${v.id}: ${(e as Error).message}`);
        }
      }
      return json({ ok: true, borradas, fallas });
    }

    // === Resto: requiere usuario autenticado ===
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user?.id) return json({ error: "Unauthorized" }, 401);

    // === START ===
    if (action === "start") {
      const { room_name, source, title } = body as {
        room_name?: string; source?: string; title?: string;
      };
      if (!room_name) return json({ error: "room_name es requerido" }, 400);
      const src = source === "meet" ? "meet" : "cowork";

      // Una grabación activa por sala: dos egress componiendo lo mismo es
      // puro gasto y confunde a todos.
      const { data: activa } = await admin
        .from("meeting_recordings")
        .select("id").eq("room_name", room_name).eq("status", "recording")
        .is("deleted_at", null).maybeSingle();
      if (activa) return json({ error: "Esta reunión ya se está grabando." }, 409);

      const { data: fila, error: insErr } = await admin
        .from("meeting_recordings")
        .insert({ room_name, source: src, title: title ?? null, started_by: user.id })
        .select("id").single();
      if (insErr) return json({ error: insErr.message }, 500);

      const archivo = `${fila.id}.mp4`;
      try {
        const info = await egress().startRoomCompositeEgress(room_name, {
          file: new EncodedFileOutput({
            fileType: EncodedFileType.MP4,
            filepath: `/out/${archivo}`,
          }),
        }, { layout: "speaker" });

        await admin.from("meeting_recordings")
          .update({ egress_id: info.egressId, storage_key: archivo })
          .eq("id", fila.id);

        return json({ ok: true, recording_id: fila.id });
      } catch (e) {
        // Si LiveKit no arrancó el egress, la fila no puede quedar
        // aparentando una grabación en curso.
        await admin.from("meeting_recordings")
          .update({ status: "failed", error: (e as Error).message?.slice(0, 300) })
          .eq("id", fila.id);
        return json({ error: `no se pudo iniciar la grabación: ${(e as Error).message}` }, 502);
      }
    }

    // === STOP ===
    if (action === "stop") {
      const { recording_id, recipients } = body as {
        recording_id?: string; recipients?: string[];
      };
      if (!recording_id) return json({ error: "recording_id es requerido" }, 400);

      const { data: rec } = await admin
        .from("meeting_recordings")
        .select("id, started_by, egress_id, storage_key, room_name, title, started_at, status")
        .eq("id", recording_id).maybeSingle();
      if (!rec) return json({ error: "grabación no encontrada" }, 404);
      // Detener puede cualquiera que esté en la reunión; el frontend solo
      // lo ofrece dentro de la llamada. Restringir al iniciador dejaría
      // grabaciones eternas si esa persona se cae de la llamada.
      if (rec.status !== "recording") return json({ error: "esta grabación ya no está en curso" }, 409);

      await admin.from("meeting_recordings")
        .update({ status: "processing", ended_at: new Date().toISOString() })
        .eq("id", rec.id);

      let size: number | null = null;
      let dur: number | null = null;
      try {
        if (rec.egress_id) {
          const info = await egress().stopEgress(rec.egress_id);
          const f = info.fileResults?.[0];
          if (f) {
            size = Number(f.size ?? 0) || null;
            dur = f.duration ? Math.round(Number(f.duration) / 1e9) : null;
          }
        }
      } catch (e) {
        // Egress pudo haber terminado solo (la sala se cerró). Se intenta
        // el tamaño directo del archivo.
        console.warn("[recordings] stopEgress:", (e as Error).message);
      }
      if (size === null && rec.storage_key) {
        try {
          const r = await fetch(await firmarUrl(rec.storage_key, "stat", 60));
          if (r.ok) size = (await r.json()).size ?? null;
        } catch { /* sin tamaño; no bloquea */ }
      }

      await admin.from("meeting_recordings")
        .update({ status: "ready", size_bytes: size, duration_seconds: dur })
        .eq("id", rec.id);

      // Destinatarios elegidos al parar + siempre quien la inició.
      const destinatarios = [...new Set([...(recipients ?? []), rec.started_by])];
      await admin.from("meeting_recording_recipients").upsert(
        destinatarios.map((u) => ({ recording_id: rec.id, user_id: u })),
        { onConflict: "recording_id,user_id" },
      );

      // Aviso por correo — desde la casilla REAL de quien grabó si la
      // tiene (el correo del equipo existe justamente para esto); si no,
      // no se manda y la grabación igual aparece en /grabaciones.
      const enviados = await avisarPorCorreo(admin, rec, destinatarios);

      return json({ ok: true, size_bytes: size, duration_seconds: dur, emails: enviados });
    }

    // === DOWNLOAD ===
    if (action === "download") {
      const { recording_id } = body as { recording_id?: string };
      if (!recording_id) return json({ error: "recording_id es requerido" }, 400);
      const { data: rec } = await admin
        .from("meeting_recordings")
        .select("id, started_by, storage_key, status, deleted_at")
        .eq("id", recording_id).maybeSingle();
      if (!rec || rec.deleted_at || rec.status !== "ready" || !rec.storage_key) {
        return json({ error: "grabación no disponible" }, 404);
      }
      if (!(await puedeVer(admin, user.id, rec))) return json({ error: "Forbidden" }, 403);
      // 10 minutos: suficiente para arrancar la descarga, inútil si el
      // link se filtra en un chat.
      return json({ ok: true, url: await firmarUrl(rec.storage_key, "d", 600) });
    }

    // === DELETE (anticipado) ===
    if (action === "delete") {
      const { recording_id } = body as { recording_id?: string };
      if (!recording_id) return json({ error: "recording_id es requerido" }, 400);
      const { data: rec } = await admin
        .from("meeting_recordings")
        .select("id, started_by, storage_key, deleted_at")
        .eq("id", recording_id).maybeSingle();
      if (!rec || rec.deleted_at) return json({ error: "grabación no encontrada" }, 404);

      // Borrar solo quien la inició o un admin (la regla del RLS de UPDATE).
      const { data: rol } = await admin
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (rec.started_by !== user.id && !rol) return json({ error: "Forbidden" }, 403);

      if (rec.storage_key) {
        const r = await fetch(await firmarUrl(rec.storage_key, "f", 60), { method: "DELETE" });
        if (!r.ok && r.status !== 404) {
          return json({ error: `no se pudo borrar el archivo (rec-server ${r.status})` }, 502);
        }
      }
      await admin.from("meeting_recordings")
        .update({ deleted_at: new Date().toISOString(), status: "deleted" })
        .eq("id", rec.id);
      return json({ ok: true });
    }

    return json({ error: `Acción desconocida: ${action}` }, 400);
  } catch (e) {
    console.error("[recordings]", e);
    return json({ error: (e as Error).message ?? "unexpected error" }, 500);
  }
});

/** Manda el link de la grabación a los destinatarios que tengan correo en
 *  Maven, desde la casilla de quien grabó. Mejor esfuerzo: el correo que
 *  falle no rompe el stop — la grabación queda en /grabaciones igual. */
// deno-lint-ignore no-explicit-any
async function avisarPorCorreo(
  admin: any,
  rec: { id: string; started_by: string; room_name: string; title: string | null; started_at: string },
  destinatarios: string[],
): Promise<number> {
  try {
    const { data: cred } = await admin
      .from("mail_credentials")
      .select("email_address, secret_cipher, secret_nonce, key_version, smtp_host, smtp_port")
      .eq("user_id", rec.started_by).is("revoked_at", null).maybeSingle();
    if (!cred) return 0; // quien grabó no tiene casilla: sin correo, sin drama

    const { data: casillas } = await admin
      .from("mail_credentials")
      .select("user_id, email_address")
      .in("user_id", destinatarios).is("revoked_at", null);
    const para = (casillas ?? [])
      .filter((c: { user_id: string }) => c.user_id !== rec.started_by)
      .map((c: { email_address: string }) => c.email_address);
    if (para.length === 0) return 0;

    const password = await unseal({
      cipher: cred.secret_cipher, nonce: cred.secret_nonce, keyVersion: cred.key_version,
    });
    if (!password) return 0;

    const appUrl = Deno.env.get("APP_URL") || "https://maven.asmtech.ai";
    const titulo = rec.title || rec.room_name;
    const rfc822 = buildMessage({
      from: cred.email_address,
      to: para,
      subject: `Grabación de la reunión: ${titulo}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:520px">
<p>Quedó disponible la grabación de <b>${titulo}</b>.</p>
<p><a href="${appUrl}/grabaciones">Verla en Maven → Grabaciones</a></p>
<p style="color:#b45309;font-size:13px"><b>Se borra a los 90 días, sin excepciones.</b>
Si la necesitás por más tiempo, descargala a tu equipo.</p>
</div>`,
      text: `Quedó disponible la grabación de "${titulo}". Vela en ${appUrl}/grabaciones — se borra a los 90 días, sin excepciones: descargala si la necesitás más tiempo.`,
    });

    const smtp = await SmtpClient.connect(cred.smtp_host, cred.smtp_port);
    try {
      const auth = await smtp.login(cred.email_address, password);
      if (!auth.ok) return 0;
      const res = await smtp.sendMessage(cred.email_address, para, rfc822);
      if (!res.ok) return 0;
      await admin.from("meeting_recording_recipients")
        .update({ notified_at: new Date().toISOString() })
        .eq("recording_id", rec.id);
      return para.length;
    } finally {
      await smtp.quit();
      smtp.close();
    }
  } catch (e) {
    console.warn("[recordings] aviso por correo falló:", (e as Error).message);
    return 0;
  }
}
