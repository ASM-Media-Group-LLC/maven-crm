// Generic transactional email relay via Resend. Lo usan los flujos de
// Chatter Evaluator y Agency QA para mandar el reporte por correo desde
// `noreply@mail.maven-ai.me` en lugar de la dirección personal del owner
// del Apps Script. Apps Script sigue haciendo docs/Sheets pero el mail
// sale por acá — ver `skipEmail: true` en el payload del webhook GAS.
//
// Auth: cualquier usuario autenticado de Maven puede dispararla. La
// validación está en el resto del flujo (sólo el flow de QA/Chatter
// expone esta llamada con un email pre-renderizado).
//
// Body: { to: string[]; subject: string; html: string; tag?: string;
//         also_include_user_ids?: string[] }
//   - to:                     lista de destinatarios (filtra strings vacíos)
//   - subject:                asunto del correo
//   - html:                   HTML completo del cuerpo
//   - tag:                    opcional, tag de Resend para tracking
//   - also_include_user_ids:  opcional, lista de auth.users.id; el server
//                             resuelve sus emails con service role y los
//                             agrega a recipients (dedup). Caso típico:
//                             el closer que subió la QA — su email NO está
//                             en la config de "Destinatarios" pero queremos
//                             que reciba SU propio reporte.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth — exige bearer válido. Igual que admin-user-actions.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized", reason: "missing_auth_header" });
    }
    const token = authHeader.replace("Bearer ", "");

    // Server-to-server: otras edge functions (qa-analyze manda el reporte de
    // Closers QA desde el server) invocan con la SERVICE KEY. auth.getUser()
    // no valida ese token (no es un user) → todos esos mails morían en 401
    // silencioso desde que el envío se movió al server (reporte de Jhon
    // 2026-07-27: no llegaban los correos de QA).
    //
    // Detección por CLAIM, no por igualdad de string: existen variantes
    // firmadas del mismo rol (el env del runtime ≠ la key del dashboard) y
    // `token === env` daba falso negativo. Es seguro: esta función corre con
    // verify_jwt=true → el gateway YA validó la firma del JWT antes de llegar
    // acá; un token con role=service_role no se puede falsificar. El portador
    // de la service key ya puede todo en el proyecto, no abre nada nuevo.
    // Se aceptan los DOS formatos de credencial de servidor, porque conviven:
    //   · JWT legacy (eyJ...) → se valida por el claim role=service_role.
    //   · Key nueva (sb_secret_...) → NO es un JWT, así que sólo se puede
    //     validar por igualdad contra el env del proyecto.
    // Chequear sólo uno de los dos falla en silencio: el intento anterior
    // (#961) validaba nada más el claim, y la llamada real edge→edge —que usa
    // la key del runtime— seguía muriendo en 401 (caso del 29-jul: el correo
    // del QA nunca salió aunque el análisis sí terminó).
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    let isServiceCall = serviceKey.length > 0 && token === serviceKey;
    if (!isServiceCall) {
      try {
        const b64 = token.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
        const claims = JSON.parse(atob(b64)) as { role?: string };
        isServiceCall = claims?.role === "service_role";
      } catch {
        // No es un JWT decodificable — lo frena el getUser de abajo.
      }
    }
    if (!isServiceCall) {
      const authClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: userError } = await authClient.auth.getUser(token);
      if (userError || !user?.id) {
        // Log diagnóstico sin exponer el token: forma de la credencial recibida.
        // Sirve para distinguir "JWT de usuario expirado" de "credencial de
        // servidor no reconocida", que fue justo el bug del 29-jul.
        console.warn(
          `[send-notification-email] 401 — token no válido (len=${token.length}, jwt_like=${token.startsWith("ey")}, sb_key_like=${token.startsWith("sb_")}, env_service_key_len=${serviceKey.length})`,
        );
        return json(401, { error: "Unauthorized", reason: "invalid_token" });
      }
    }

    const body = await req.json().catch(() => null) as
      | {
          to?: unknown;
          subject?: unknown;
          html?: unknown;
          tag?: unknown;
          also_include_user_ids?: unknown;
        }
      | null;
    if (!body) return json(400, { error: "Body inválido (JSON requerido)" });

    const toList = Array.isArray(body.to)
      ? (body.to as unknown[])
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .map((s) => s.trim())
      : [];
    const subject = typeof body.subject === "string" ? body.subject : "";
    const html = typeof body.html === "string" ? body.html : "";
    const tag = typeof body.tag === "string" ? body.tag : null;
    const alsoIncludeUserIds = Array.isArray(body.also_include_user_ids)
      ? (body.also_include_user_ids as unknown[]).filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        )
      : [];

    // Resolver emails de usuarios extra (ej. closer que subió la QA).
    // Usa service role para leer auth.users — el authClient con anon key
    // del caller no tiene permiso para listar usuarios.
    if (alsoIncludeUserIds.length > 0) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      for (const uid of alsoIncludeUserIds) {
        try {
          const { data: u } = await adminClient.auth.admin.getUserById(uid);
          const email = u?.user?.email;
          if (email && !toList.includes(email)) toList.push(email);
        } catch (e) {
          console.warn(
            "[send-notification-email] failed to resolve email for user",
            uid,
            (e as Error).message,
          );
        }
      }
    }

    if (toList.length === 0) return json(400, { error: "to[] vacío" });
    if (!subject) return json(400, { error: "subject requerido" });
    if (!html) return json(400, { error: "html requerido" });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json(500, { error: "RESEND_API_KEY no configurada" });
    }

    // Normaliza el "from": si el env var viene como email pelado
    // (`noreply@mail.maven-ai.me`), le anteponemos "Maven CRM <...>" para
    // que Gmail muestre el display name en vez de "noreply". Si el admin
    // ya configuró un name (formato `Display <email>`), se respeta.
    const rawFrom =
      Deno.env.get("NOTIFICATION_FROM_EMAIL") || "noreply@mail.maven-ai.me";
    const fromEmail = rawFrom.includes("<") ? rawFrom : `Maven CRM <${rawFrom}>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toList,
        subject,
        html,
        tags: tag ? [{ name: "type", value: tag }] : undefined,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("[send-notification-email] Resend failed", resp.status, text);
      return json(502, {
        error: `Resend ${resp.status}`,
        detail: text.slice(0, 400),
      });
    }

    const data = await resp.json().catch(() => ({}));
    return json(200, { success: true, id: data?.id ?? null });
  } catch (err: unknown) {
    console.error("[send-notification-email] Internal error:", err);
    return json(500, { error: "Internal server error" });
  }
});
