import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, BOT_LIDS, logEvent, neutralizarVoseo, redactPhones, whatsappCors } from "../_shared/whatsapp.ts";
import { desescaparSaltosLiterales } from "../_shared/agent-output-guards.ts";

// whatsapp-send — manda mensajes a un grupo via el provider configurado.
//
// Acepta dos modos:
//   1. Drain queue: POST sin body → procesa whatsapp_reminders pending
//      con trigger_at <= now() y los manda. Esto lo llama el cron cada
//      pocos minutos.
//   2. Send ad-hoc: POST con { group_id, body, [commitment_id] } → manda
//      un mensaje directo (lo usa whatsapp-agent y futuras integraciones).
//
// Provider: por ahora soportamos Evolution API (POST a su /sendText/...).
// El URL base y la instance se leen del config del grupo (provider) y
// del env (WHATSAPP_EVOLUTION_URL, WHATSAPP_EVOLUTION_API_KEY).
//
// Defensa: si bot_enabled=false en el grupo, marcamos el reminder como
// cancelled con reason 'bot_disabled' y NO mandamos nada. El admin lo
// debe habilitar explícito por grupo.

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven";
// EVOLUTION_API_VERSION controla el shape del payload de /message/sendText:
//   v1 (default): { number, options:{delay,presence}, textMessage:{text} }  ← Evolution v1.8.x
//   v2:           { number, text }                                          ← Evolution v2.4.x
// Cambiar cuando se haga el upgrade del contenedor a v2.
const EVOLUTION_API_VERSION = Deno.env.get("WHATSAPP_EVOLUTION_API_VERSION") ?? "v1";
// Para re-invocar al agente cuando un reminder es una ORDEN (kind='accion').
const PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "";
const CRON_TOKEN = Deno.env.get("CRON_INTERNAL_TOKEN") ?? "";

interface SendRequest {
  // Modo ad-hoc.
  group_id?: string;
  body?: string;
  commitment_id?: string;
  // Menciones reales: array de JIDs/LIDs completos
  // (ej. ["143250161664036@lid", "123@s.whatsapp.net"]) que se pasan al
  // gateway para que WhatsApp renderice esos @ como pings reales.
  // El texto en `body` debe contener "@<lid_o_phone_sin_sufijo>" en
  // los lugares donde quieras la mención.
  mentions?: string[];
  // Imagen adjunta (opcional): el mensaje sale como imagen con `body` de caption
  // vía /message/sendMedia del gateway. Lo usa el agente para mandar EVIDENCIA
  // del scan (screenshot de la promo) cuando una manager disputa un registro
  // (pedido de Jhon 06/08). El caption pasa por las mismas guardas que el texto.
  image_url?: string;
  // Modo queue (default true si no hay group_id+body).
  drain?: boolean;
  drain_limit?: number;
}

interface ProviderSendResult {
  ok: boolean;
  externalId?: string;
  error?: string;
}

async function sendViaEvolution(
  groupExternalId: string,
  body: string,
  mentions?: string[],
): Promise<ProviderSendResult> {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    return { ok: false, error: "evolution_not_configured" };
  }
  const url = `${EVOLUTION_URL.replace(/\/$/, "")}/message/sendText/${EVOLUTION_INSTANCE}`;
  // Payload depende de la versión de Evolution. Ver constante EVOLUTION_API_VERSION.
  // mentions es opcional — solo lo agrega nuestro Baileys gateway, no
  // las Evolution oficiales. Si no se pasa, el endpoint manda texto plano.
  const basePayload = EVOLUTION_API_VERSION === "v2"
    ? { number: groupExternalId, text: body }
    : {
        number: groupExternalId,
        options: { delay: 0, presence: "composing" },
        textMessage: { text: body },
      };
  const payload = mentions && mentions.length > 0
    ? { ...basePayload, mentions }
    : basePayload;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": EVOLUTION_API_KEY,
      },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `evolution ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json() as { key?: { id?: string } };
    return { ok: true, externalId: data?.key?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Imagen con caption — mismo gateway, endpoint /message/sendMedia (lo implementa
// nuestro Baileys gateway; las menciones no aplican en media, WhatsApp las ignora).
async function sendMediaViaEvolution(
  groupExternalId: string,
  imageUrl: string,
  caption: string,
): Promise<ProviderSendResult> {
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
    return { ok: false, error: "evolution_not_configured" };
  }
  const url = `${EVOLUTION_URL.replace(/\/$/, "")}/message/sendMedia/${EVOLUTION_INSTANCE}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
      body: JSON.stringify({ number: groupExternalId, mediatype: "image", url: imageUrl, caption }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `evolution_media ${resp.status}: ${txt.slice(0, 200)}` };
    }
    const data = await resp.json() as { key?: { id?: string } };
    return { ok: true, externalId: data?.key?.id };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function sendOne(args: {
  groupId: string;
  body: string;
  tenantId: string;
  reminderId?: string;
  mentions?: string[];
  imageUrl?: string;
}): Promise<ProviderSendResult> {
  const sb = adminClient();

  const { data: group, error: gErr } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, external_id, provider, bot_enabled, active, is_direct")
    .eq("id", args.groupId)
    .single();

  if (gErr || !group) {
    return { ok: false, error: "group_not_found" };
  }
  if (!group.active) return { ok: false, error: "group_inactive" };
  if (!group.bot_enabled) return { ok: false, error: "bot_disabled" };

  // ── MARKDOWN → FORMATO WHATSAPP ─────────────────────────────────────────────
  // WhatsApp usa *un* asterisco para negrita y _uno_ para itálica. El modelo escribe
  // markdown estándar (**negrita**, ## títulos, - bullets) y esos asteriscos dobles
  // salen CRUDOS a la vista: el 30/07 pasó en 5 mensajes seguidos de la tanda de
  // asesoría a Miguel, justo cuando Álvaro venía pidiendo mensajes más prolijos.
  // Va acá y no en reply_to_group porque este es el único punto por el que salen
  // TODOS los mensajes (agente, recordatorios, digests, supervisor-tick).
  const mdAWhatsApp = (s: string) =>
    s
      // **negrita** → *negrita* (no toca un ***triple*** ni un * suelto de lista)
      .replace(/(?<!\*)\*\*(?!\s)([^*\n]+?)(?<!\s)\*\*(?!\*)/g, "*$1*")
      // __itálica__ → _itálica_
      .replace(/(?<!_)__(?!\s)([^_\n]+?)(?<!\s)__(?!_)/g, "_$1_")
      // Encabezados markdown (### Título) → negrita de WhatsApp
      .replace(/^\s{0,3}#{1,6}\s+(.+?)\s*$/gm, "*$1*")
      // Bullets "- " / "* " al inicio de línea → viñeta legible
      .replace(/^(\s*)[-*]\s+(?=\S)/gm, "$1• ");

  // ── GUARDA DE PII: nunca publicar teléfonos en un GRUPO ─────────────────────
  // Maven oculta los teléfonos por permiso (can_see_contact_phone, default-deny), pero el
  // bot corre con service_role y escribe texto libre. El 30/07, al reconocerle a Daniel su
  // primer número del día, publicó el teléfono de la lead en AI WARMING — dos veces, a la
  // vista de todo el grupo. Va acá, en el ÚNICO punto por el que salen TODOS los mensajes
  // (respuestas del agente, recordatorios, digests, reportes), en vez de confiar en una
  // regla del prompt que el modelo puede ignorar.
  // Los DMs quedan afuera: son 1-a-1 con el dueño de la data.
  // El bot JAMÁS se menciona a sí mismo ni pega lids crudos como texto: el
  // 04/08 le respondió a Carolina arrancando con "@140716701401153 dale…" (su
  // PROPIO lid, imitando el formato de la mención de ella) — para la gente es
  // un chorro de números. Guarda en el borde de salida, como redactPhones:
  // strip de @<lid del bot> en cualquier posición.
  const sinAutoMencion = BOT_LIDS.reduce(
    (txt, lid) => txt.replace(new RegExp(`@${lid}[,:]?\\s*`, "g"), ""),
    args.body,
  ).trimStart();
  // "\\n" literales → saltos reales (guardas de salida; caso Cheryl 07/08): si el
  // modelo escapa los saltos en el body, el mensaje llega como muro de texto con
  // los "\\n" a la vista. Va ANTES del resto para que las demás guardas vean el
  // texto ya normalizado.
  const sinEscapes = desescaparSaltosLiterales(sinAutoMencion);
  // Voseo → neutro también en el borde (misma filosofía que redactPhones): un
  // "probá"/"venís" suelto rompe el registro que pidió el equipo aunque el
  // prompt esté limpio. Aplica a grupos Y DMs — el bot habla neutro siempre.
  const sinVoseo = neutralizarVoseo(sinEscapes);
  const bodyFinal = mdAWhatsApp(group.is_direct === true ? sinVoseo : redactPhones(sinVoseo));

  let result: ProviderSendResult;
  if (group.provider === "evolution") {
    result = args.imageUrl
      ? await sendMediaViaEvolution(group.external_id, args.imageUrl, bodyFinal)
      : await sendViaEvolution(group.external_id, bodyFinal, args.mentions);
  } else if (group.provider === "manual") {
    // Modo manual: no mandamos al provider, solo grabamos la salida en
    // whatsapp_messages para testing y para ver lo que el bot habría
    // dicho.
    result = { ok: true, externalId: `manual-${crypto.randomUUID()}` };
  } else {
    result = { ok: false, error: `unsupported_provider:${group.provider}` };
  }

  // Registrar el mensaje saliente en whatsapp_messages si se mandó OK.
  if (result.ok && result.externalId) {
    const { data: inserted } = await sb
      .from("whatsapp_messages")
      .insert({
        tenant_id: group.tenant_id,
        group_id: group.id,
        external_id: result.externalId,
        sender_external_id: "bot@maven",
        sender_display_name: "Maven Asistente",
        body: bodyFinal,
        msg_type: args.imageUrl ? "image" : "text",
        media_url: args.imageUrl ?? null,
        is_from_bot: true,
        sent_at: new Date().toISOString(),
        analyzed_at: new Date().toISOString(),
        analysis: { source: "bot", reminder_id: args.reminderId ?? null },
      })
      .select("id")
      .single();

    await logEvent(sb, {
      tenantId: group.tenant_id,
      groupId: group.id,
      kind: "message_out",
      payload: {
        body_preview: bodyFinal.slice(0, 120),
        reminder_id: args.reminderId,
        provider_msg_id: result.externalId,
        message_id: inserted?.id,
      },
    });

    return { ok: true, externalId: inserted?.id };
  }

  await logEvent(sb, {
    tenantId: group.tenant_id,
    groupId: group.id,
    kind: "error",
    payload: { stage: "send", error: result.error, reminder_id: args.reminderId },
  });

  return result;
}

async function drainQueue(limit: number): Promise<{ sent: number; failed: number }> {
  const sb = adminClient();

  const { data: reminders, error } = await sb
    .rpc("whatsapp_pending_reminders", { p_limit: limit });

  if (error) {
    console.warn("drainQueue rpc error:", error.message);
    return { sent: 0, failed: 0 };
  }
  if (!reminders || reminders.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  // Las órdenes (kind='accion') bloquean el drain hasta 50s cada una mientras el
  // agente ejecuta. Cap por tick para no acercarnos al techo de pared de la edge
  // function; lo que no entre queda pending y sale en el próximo tick (5 min).
  let accionesEsteTick = 0;

  for (const r of reminders as Array<{
    id: string;
    tenant_id: string;
    group_id: string;
    kind: string;
    body: string | null;
    attempt_count: number;
    commitment_id: string | null;
  }>) {
    // ── kind='accion': el recordatorio es una ORDEN, no un texto a postear ──────
    // El caso que motivó esto (05/08): Álvaro ordenó "mañana 9AM apretá en WARMING",
    // el bot lo guardó… y a las 9AM el drain publicó la nota tal cual EN EL DM como
    // "Recordatorio interno". Nadie la ejecutó y el grupo recibió un saludo suave.
    // Acá, en vez de postear el body, se re-invoca al agente EN el grupo destino con
    // la instrucción para que la redacte y publique él mismo (mismo patrón que el
    // corte-tick de las 2h, que funciona a diario).
    if (r.kind === "accion") {
      if (accionesEsteTick >= 2) continue; // queda pending para el próximo tick
      accionesEsteTick += 1;

      // Claim atómico: si otro drain concurrente la tomó, esta update no matchea.
      // Nos llevamos el metadata actual para no pisarlo al sellar executed_at.
      const { data: claimed } = await sb
        .from("whatsapp_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", r.id)
        .eq("status", "pending")
        .select("id, metadata");
      if (!claimed || claimed.length === 0) continue;
      const metaActual = (claimed[0] as { metadata?: Record<string, unknown> }).metadata ?? {};

      let ejecutado = false;
      let detalle = "";
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 50_000);
        const resp = await fetch(`${PROJECT_URL}/functions/v1/whatsapp-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Cron-Token": CRON_TOKEN },
          body: JSON.stringify({
            group_id: r.group_id,
            invoked_by: "reminder_action",
            reminder_id: r.id,
            user_question: r.body ?? "",
          }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = await resp.json().catch(() => ({})) as { ok?: boolean; final_reply?: string | null };
        // Ejecutada = la corrida terminó publicando algo. Un final_reply vacío es
        // una corrida muda: la orden NO se cumplió y hay que reintentar.
        ejecutado = resp.ok && Boolean(data.final_reply);
        detalle = ejecutado ? "" : `agent_sin_publicacion (http ${resp.status})`;
      } catch (e) {
        detalle = `agent_fetch: ${(e as Error).message}`.slice(0, 300);
      }

      if (ejecutado) {
        await sb.from("whatsapp_reminders")
          .update({ metadata: { ...metaActual, executed_at: new Date().toISOString() } })
          .eq("id", r.id);
        sent += 1;
      } else {
        // Devolver a pending para que el próximo tick reintente; a los 3 intentos, failed.
        const nextAttempt = (r.attempt_count ?? 0) + 1;
        await sb.from("whatsapp_reminders")
          .update({
            status: nextAttempt >= 3 ? "failed" : "pending",
            attempt_count: nextAttempt,
            error: detalle.slice(0, 500),
          })
          .eq("id", r.id);
        failed += 1;
      }
      continue;
    }

    if (!r.body) {
      // body NULL — tendríamos que generar contenido dinámico, pero
      // por ahora marcamos como failed para que un admin lo revise.
      await sb
        .from("whatsapp_reminders")
        .update({ status: "failed", error: "body_null_not_supported_yet" })
        .eq("id", r.id);
      failed += 1;
      continue;
    }

    // Los recordatorios se guardan como TEXTO PLANO, y el agente suele escribir el
    // destinatario como "@<lid>" (copiado de la tabla de miembros). Como el drain
    // mandaba el body tal cual, SIN el array `mentions`, WhatsApp no podía resolver
    // el LID y el equipo veía "@249125350154247, recordatorio: ..." — números crudos.
    // (Caso real 29/07 con María.) Acá resolvemos cada @<dígitos> a su NOMBRE y de paso
    // pasamos los LIDs en `mentions` para que además le llegue el ping.
    let outBody = r.body;
    let mentions: string[] | undefined;
    const lids = [...String(r.body).matchAll(/@(\d{6,})/g)].map((m) => m[1]);
    if (lids.length > 0) {
      const { data: mem } = await sb
        .from("whatsapp_members")
        .select("external_id, display_name, profiles:user_id(full_name)")
        .eq("group_id", r.group_id)
        .in("external_id", lids.map((d) => `${d}@lid`));
      const found: string[] = [];
      for (const d of lids) {
        const row = (mem ?? []).find((x: any) => x.external_id === `${d}@lid`) as any;
        if (!row) continue;
        const nombre = String(row.profiles?.full_name ?? row.display_name ?? "").split(" ")[0];
        if (nombre) outBody = outBody.split(`@${d}`).join(nombre);
        found.push(`${d}@lid`);
      }
      if (found.length > 0) mentions = found;
    }

    const result = await sendOne({
      groupId: r.group_id,
      body: outBody,
      tenantId: r.tenant_id,
      reminderId: r.id,
      mentions,
    });

    if (result.ok) {
      await sb
        .from("whatsapp_reminders")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          sent_message_id: result.externalId ?? null,
        })
        .eq("id", r.id);

      // Si está atado a un commitment, bumpeamos followup_count y
      // movemos status si corresponde (pending→overdue, overdue→stale).
      // La RPC hace todo atómicamente, evita races con el extractor.
      if (r.commitment_id) {
        const { error: bumpErr } = await sb.rpc(
          "whatsapp_bump_commitment_followup",
          { p_id: r.commitment_id },
        );
        if (bumpErr) console.warn("bump followup err:", bumpErr.message);
      }

      sent += 1;
    } else {
      const nextAttempt = (r.attempt_count ?? 0) + 1;
      const newStatus = nextAttempt >= 3 ? "failed" : "pending";
      await sb
        .from("whatsapp_reminders")
        .update({
          status: newStatus,
          attempt_count: nextAttempt,
          error: result.error?.slice(0, 500),
        })
        .eq("id", r.id);
      failed += 1;
    }
  }

  return { sent, failed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: whatsappCors });
  }

  if (!authorizeCronOrJwt(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  let body: SendRequest = {};
  try {
    body = (await req.json()) as SendRequest;
  } catch {
    // OK — POST sin body = drain.
  }

  try {
    if (body.group_id && body.body) {
      // Resolver tenant del grupo.
      const sb = adminClient();
      const { data: g } = await sb
        .from("whatsapp_groups")
        .select("tenant_id")
        .eq("id", body.group_id)
        .single();
      if (!g) {
        return new Response(JSON.stringify({ ok: false, error: "group_not_found" }), {
          status: 404,
          headers: { ...whatsappCors, "Content-Type": "application/json" },
        });
      }
      const result = await sendOne({
        groupId: body.group_id,
        body: body.body,
        tenantId: g.tenant_id,
        mentions: body.mentions,
        imageUrl: body.image_url,
      });
      return new Response(JSON.stringify(result), {
        status: result.ok ? 200 : 500,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }

    if (body.drain !== false) {
      const result = await drainQueue(body.drain_limit ?? 20);
      return new Response(JSON.stringify({ ok: true, ...result }), {
        status: 200,
        headers: { ...whatsappCors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "no_action" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" } },
    );
  }
});

// deploy-nonce 2026-08-06T19:35Z: los deploys de la tarde murieron colgados (2 runs cancelados a 15m,
// cero funciones subidas); este commit solo fuerza el redeploy de agent+send con el bundle ya mergeado.
