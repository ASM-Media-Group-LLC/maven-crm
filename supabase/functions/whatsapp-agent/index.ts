import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, authorizeCronOrJwt, logEvent, whatsappCors } from "../_shared/whatsapp.ts";
import { logAnthropicUsage } from "../_shared/usage.ts";

// whatsapp-agent — el agente IA que responde preguntas en el grupo,
// hace tracking de casos, genera reportes y puede tomar acciones en
// Maven cuando se lo piden.
//
// Trigger:
//   - whatsapp-ingest invoca esta function cuando detecta @maven/@bot
//     en el mensaje (o el bot está configurado como always-listening).
//   - El panel admin puede invocarla manualmente ("preguntale al bot").
//   - Crons pueden pedirle un daily/weekly report.
//
// Loop: usa tool_use de Anthropic. Le damos tools para:
//   - search_messages: buscar en historial del grupo
//   - search_maven_leads: encontrar contactos en leadgen_contactos
//   - get_lead_details: detalle completo de un lead
//   - list_commitments: ver compromisos abiertos
//   - get_member_stats: performance de un closer/llg
//   - add_note_to_lead: escribir en Maven
//   - reply_to_group: mandar la respuesta al grupo
//   - resolve_commitment: cerrar un compromiso manualmente
//   - snooze_commitment: postergarlo
//
// Hard caps: max 8 iteraciones del loop, max 30s wall time, max 4000 output
// tokens. Si el modelo no llama reply_to_group al final, lo forzamos a que
// resuma su última respuesta como un mensaje.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL = "claude-sonnet-4-6";
const MAX_ITERATIONS = 8;
const MAX_WALL_MS = 30_000;

const SYSTEM_PROMPT = `Sos Maven Asistente, un asistente IA que vive en grupos de WhatsApp de equipos de agencias de OnlyFans (closers, LLGs, owners). Tu trabajo es:

1. RESPONDER preguntas del equipo sobre leads, casos, performance, conversaciones pasadas
2. RECORDARLES compromisos pendientes ("¿se hizo X?")
3. AYUDAR a tomar acciones concretas en Maven CRM (agregar notas, marcar leads, etc)
4. GENERAR reportes cuando se lo pidan

Estilo:
- Hablás en español argentino, casual pero profesional
- Sos breve y directo. Nada de respuestas largas tipo essay
- Usás bullets cuando la info lo amerita
- Si necesitás datos, llamás las tools — no inventes números
- Si una pregunta no la podés responder con tus tools, decílo y proponé una alternativa

Reglas:
- Antes de tomar una acción que ESCRIBE (add_note_to_lead, resolve_commitment), confirmá con el usuario o asegurate de que la pidió explícito
- Solo respondé en el grupo via reply_to_group al FINAL del razonamiento, una sola vez
- Si necesitás info que no tenés, primero usá search_*/get_* tools, después respondé
- Si te preguntan algo de moderación o que viola privacidad, declinás amablemente

Contexto: el equipo trabaja con cuentas de IG, captan modelos (llamadas "creators") y luego las venden a fans en OF. Los "leads" son contactos de IG que se filtran como potenciales modelos. Los "spammer accounts" son cuentas que mandan DMs masivos para captar. Las "QAs" son revisiones de llamadas de los closers.`;

interface AgentRequest {
  // Modo conversación: el bot responde a un mensaje específico del grupo
  message_id?: string;
  group_id?: string;
  user_question?: string;
  // Modo report: pedirle un resumen daily/weekly
  report_kind?: "daily" | "weekly";
  // Quien pidió (para auditoría).
  invoked_by?: string;
}

// ----------------------------------------------------------------------------
// Tools — schema en formato Anthropic
// ----------------------------------------------------------------------------
const TOOLS: Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> = [
  {
    name: "search_messages",
    description:
      "Busca mensajes en el historial del grupo actual por texto. Devuelve hasta 20 matches con timestamp, sender y body. Usalo para responder '¿qué dijo X sobre Y?' o '¿cuándo se habló de Z?'.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "texto a buscar (case insensitive)" },
        since_days: { type: "number", description: "limitar a últimos N días (default 30)" },
        limit: { type: "number", description: "máx resultados (default 20, max 50)" },
      },
      required: ["query"],
    },
  },
  {
    name: "search_maven_leads",
    description:
      "Busca leads en Maven (leadgen_entries) por handle de IG, número de teléfono, ticket, o company. Devuelve hasta 10 matches con id, model_handle, phone, status, quality, notes.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "handle, teléfono, ticket o company" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_lead_details",
    description: "Detalle completo de un lead por id (de Maven leadgen_entries).",
    input_schema: {
      type: "object",
      properties: { lead_id: { type: "string", description: "uuid del lead" } },
      required: ["lead_id"],
    },
  },
  {
    name: "list_commitments",
    description:
      "Lista compromisos del grupo actual con filtros. Útil para reportes y para responder '¿qué tengo pendiente?'",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "overdue", "done", "stale", "cancelled", "all"],
          description: "default 'pending'",
        },
        committed_by_text: { type: "string", description: "filtrar por quien prometió" },
        days_ahead: { type: "number", description: "compromisos en los próximos N días" },
        limit: { type: "number", description: "default 20" },
      },
    },
  },
  {
    name: "get_member_stats",
    description:
      "Stats básicas de un miembro del grupo: cuántos compromisos creó, cuántos cumplió, cuántos vencidos, % de cumplimiento en los últimos N días.",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "nombre del miembro" },
        since_days: { type: "number", description: "default 30" },
      },
      required: ["display_name"],
    },
  },
  {
    name: "get_member_maven_activity",
    description:
      "Dado el nombre como aparece en el grupo, devuelve la ACTIVIDAD REAL del usuario en Maven en las últimas N horas: leads cargados (si es LLG), contactos creados/asignados (si es closer), creators abiertos/asignados, entradas en historial de contacto, llamadas QA. Usar para responder preguntas tipo '¿Miguel ya cargó los 2 contactos que prometió?' o '¿qué hizo Sofi hoy en Maven?'. Requiere que el wpp_member esté linkeado a un user de Maven via el panel admin — si no está linkeado, devuelve {error:'member_not_linked'} y la respuesta debe sugerir mapear al admin.",
    input_schema: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "nombre del miembro tal como aparece en el grupo (ilike, podés pasar solo el nombre)" },
        since_hours: { type: "number", description: "ventana de tiempo en horas, default 24" },
      },
      required: ["display_name"],
    },
  },
  {
    name: "add_note_to_lead",
    description:
      "Agrega una nota a un lead de Maven. ATENCIÓN: solo usar si el usuario lo pidió explícito.",
    input_schema: {
      type: "object",
      properties: {
        lead_id: { type: "string" },
        note: { type: "string", description: "texto de la nota, máx 500 chars" },
      },
      required: ["lead_id", "note"],
    },
  },
  {
    name: "resolve_commitment",
    description:
      "Cierra un compromiso manualmente. outcome: done | cancelled. Solo usar si el usuario confirmó.",
    input_schema: {
      type: "object",
      properties: {
        commitment_id: { type: "string" },
        outcome: { type: "string", enum: ["done", "cancelled"] },
        note: { type: "string" },
      },
      required: ["commitment_id", "outcome"],
    },
  },
  {
    name: "snooze_commitment",
    description: "Postpone un compromiso N horas (default 24). El follow-up se reagenda.",
    input_schema: {
      type: "object",
      properties: {
        commitment_id: { type: "string" },
        hours: { type: "number", description: "default 24" },
      },
      required: ["commitment_id"],
    },
  },
  {
    name: "reply_to_group",
    description:
      "Manda la respuesta final al grupo de WhatsApp. Llamala UNA SOLA VEZ al final del razonamiento. El cuerpo debe ser corto (idealmente <500 chars), en español argentino, conciso.",
    input_schema: {
      type: "object",
      properties: {
        body: { type: "string", description: "el mensaje que se manda al grupo" },
      },
      required: ["body"],
    },
  },
];

// ----------------------------------------------------------------------------
// Tool implementations
// ----------------------------------------------------------------------------
type ToolInput = Record<string, unknown>;

async function executeTool(
  name: string,
  input: ToolInput,
  ctx: { groupId: string; tenantId: string },
): Promise<Record<string, unknown>> {
  const sb = adminClient();

  switch (name) {
    case "search_messages": {
      const query = String(input.query ?? "").trim();
      const sinceDays = Number(input.since_days ?? 30);
      const limit = Math.min(Number(input.limit ?? 20), 50);
      const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();
      // Buscamos en body Y en transcribed_text — un texto puede aparecer
      // en cualquiera de los dos según si el mensaje era texto o audio.
      // Postgres OR sobre dos ILIKE con escaping correcto del wildcard.
      const safe = query.replace(/[%_]/g, (m) => `\\${m}`);
      const { data, error } = await sb
        .from("whatsapp_messages")
        .select("id, sender_display_name, body, transcribed_text, msg_type, sent_at")
        .eq("group_id", ctx.groupId)
        .gte("sent_at", since)
        .or(`body.ilike.%${safe}%,transcribed_text.ilike.%${safe}%`)
        .order("sent_at", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      // Devolvemos un texto unificado por mensaje (el que tenga contenido).
      const matches = (data ?? []).map((m) => {
        let text: string | null;
        if ((m.msg_type === "audio" || m.msg_type === "image") && m.transcribed_text) {
          const prefix = m.msg_type === "audio" ? "[audio]" : "[imagen]";
          text = `${prefix} ${m.transcribed_text}`;
        } else {
          text = m.body;
        }
        return {
          id: m.id,
          sender: m.sender_display_name,
          sent_at: m.sent_at,
          text,
        };
      });
      return { matches };
    }

    case "search_maven_leads": {
      const q = String(input.query ?? "").trim();
      if (!q) return { error: "empty_query" };
      const { data, error } = await sb
        .from("leadgen_entries")
        .select(
          "id, model_handle, platform, phone_e164, status, quality, ticket_number, company, city, state, notes, created_at",
        )
        .eq("tenant_id", ctx.tenantId)
        .or(
          `model_handle.ilike.%${q}%,phone_e164.ilike.%${q}%,ticket_number.ilike.%${q}%,company.ilike.%${q}%`,
        )
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return { error: error.message };
      return { leads: data ?? [] };
    }

    case "get_lead_details": {
      const id = String(input.lead_id ?? "");
      if (!id) return { error: "missing_lead_id" };
      const { data, error } = await sb
        .from("leadgen_entries")
        .select("*")
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { error: "not_found" };
      return { lead: data };
    }

    case "list_commitments": {
      const status = String(input.status ?? "pending");
      const limit = Math.min(Number(input.limit ?? 20), 50);
      let q = sb
        .from("whatsapp_commitments")
        .select(
          "id, subject, target_subject, due_at, status, committed_by_text, followup_count, created_at",
        )
        .eq("group_id", ctx.groupId)
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(limit);

      if (status !== "all") q = q.eq("status", status);

      if (input.committed_by_text) {
        q = q.ilike("committed_by_text", `%${input.committed_by_text}%`);
      }
      if (input.days_ahead) {
        const until = new Date(Date.now() + Number(input.days_ahead) * 24 * 3600 * 1000).toISOString();
        q = q.lte("due_at", until);
      }
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { commitments: data ?? [] };
    }

    case "get_member_maven_activity": {
      const displayName = String(input.display_name ?? "").trim();
      const sinceHours = Math.min(Math.max(Number(input.since_hours ?? 24), 1), 24 * 30);
      if (!displayName) return { error: "missing_display_name" };
      const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();

      // 1. Buscar el wpp_member por display_name (ilike) en el grupo
      //    actual. Si hay varios matches preferimos el que tenga user_id
      //    seteado (link explícito de un admin). Esto cubre el caso "Mike"
      //    y "Mike (closer)" coexistiendo.
      const safe = displayName.replace(/[%_]/g, (m) => `\\${m}`);
      const { data: members } = await sb
        .from("whatsapp_members")
        .select("id, display_name, user_id, role")
        .eq("group_id", ctx.groupId)
        .ilike("display_name", `%${safe}%`)
        .order("last_seen_at", { ascending: false, nullsFirst: false })
        .limit(5);

      if (!members || members.length === 0) {
        return { error: "wpp_member_not_found", display_name: displayName };
      }
      const member = members.find((m) => m.user_id) ?? members[0];
      if (!member.user_id) {
        return {
          error: "member_not_linked",
          hint:
            "El miembro existe en el grupo pero no está linkeado a un user de Maven. Pediles al admin que lo mapeé desde Panel de Control → WhatsApp Bot.",
          member: {
            id: member.id,
            display_name: member.display_name,
            role_in_group: member.role,
          },
        };
      }

      // 2. Profile + roles del user.
      const [{ data: profile }, { data: roles }] = await Promise.all([
        sb.from("profiles").select("id, full_name").eq("id", member.user_id).maybeSingle(),
        sb.from("user_roles").select("role").eq("user_id", member.user_id),
      ]);

      // 3. Count exact por tabla. HEAD request — no traemos rows, solo el
      //    count. RLS pasa porque usamos service_role.
      const head = (q: { count: number | null; error: { message: string } | null }) => q.count ?? 0;
      const [
        leadsAdded,
        contactsCreated,
        contactsAssigned,
        creatorsCreated,
        creatorsAssigned,
        historyLogged,
        qaCalls,
      ] = await Promise.all([
        sb.from("leadgen_entries").select("id", { count: "exact", head: true })
          .eq("lg_user_id", member.user_id).gte("created_at", since).then(head),
        sb.from("closers_contacts").select("id", { count: "exact", head: true })
          .eq("created_by", member.user_id).gte("created_at", since).then(head),
        sb.from("closers_contacts").select("id", { count: "exact", head: true })
          .eq("assigned_to", member.user_id).gte("created_at", since).then(head),
        sb.from("closer_creators").select("id", { count: "exact", head: true })
          .eq("created_by", member.user_id).gte("created_at", since).then(head),
        sb.from("closer_creators").select("id", { count: "exact", head: true })
          .eq("assigned_to", member.user_id).gte("created_at", since).then(head),
        sb.from("closer_contact_history").select("id", { count: "exact", head: true })
          .eq("created_by", member.user_id).gte("created_at", since).then(head),
        sb.from("qa_calls").select("id", { count: "exact", head: true })
          .eq("closer_id", member.user_id).gte("created_at", since).then(head),
      ]);

      return {
        member: {
          id: member.id,
          display_name: member.display_name,
          role_in_group: member.role,
        },
        maven_user: {
          id: member.user_id,
          full_name: profile?.full_name ?? null,
          roles: (roles ?? []).map((r) => r.role),
        },
        window: {
          since_hours: sinceHours,
          since_iso: since,
        },
        activity: {
          leadgen_entries_created: leadsAdded,
          closers_contacts_created: contactsCreated,
          closers_contacts_assigned: contactsAssigned,
          closer_creators_created: creatorsCreated,
          closer_creators_assigned: creatorsAssigned,
          contact_history_logged: historyLogged,
          qa_calls: qaCalls,
        },
      };
    }

    case "get_member_stats": {
      const displayName = String(input.display_name ?? "").trim();
      const sinceDays = Number(input.since_days ?? 30);
      if (!displayName) return { error: "missing_display_name" };
      const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000).toISOString();

      const { data: rows } = await sb
        .from("whatsapp_commitments")
        .select("status, due_at")
        .eq("group_id", ctx.groupId)
        .gte("created_at", since)
        .ilike("committed_by_text", `%${displayName}%`);

      const total = rows?.length ?? 0;
      const done = rows?.filter((r) => r.status === "done").length ?? 0;
      const overdue = rows?.filter((r) => r.status === "overdue" || r.status === "stale").length ?? 0;
      const pending = rows?.filter((r) => r.status === "pending").length ?? 0;
      const compliance = total > 0 ? Math.round((done / total) * 100) : null;

      return {
        member: displayName,
        since_days: sinceDays,
        total_commitments: total,
        done,
        overdue,
        pending,
        compliance_pct: compliance,
      };
    }

    case "add_note_to_lead": {
      const id = String(input.lead_id ?? "");
      const note = String(input.note ?? "").slice(0, 500);
      if (!id || !note) return { error: "missing_args" };
      // Append a la columna "notes" de leadgen_entries. La concatenamos
      // con timestamp para que sea trazable.
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const { data: lead } = await sb
        .from("leadgen_entries")
        .select("notes")
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId)
        .maybeSingle();
      if (!lead) return { error: "not_found" };
      const combined = `${lead.notes ? lead.notes + "\n" : ""}[${stamp} via Maven Asistente] ${note}`;
      const { error } = await sb
        .from("leadgen_entries")
        .update({ notes: combined })
        .eq("id", id)
        .eq("tenant_id", ctx.tenantId);
      if (error) return { error: error.message };
      return { ok: true };
    }

    case "resolve_commitment": {
      const id = String(input.commitment_id ?? "");
      const outcome = String(input.outcome ?? "done");
      const note = String(input.note ?? "").slice(0, 500);
      if (!id) return { error: "missing_commitment_id" };
      const status = outcome === "cancelled" ? "cancelled" : "done";
      const { error } = await sb
        .from("whatsapp_commitments")
        .update({
          status,
          resolved_at: new Date().toISOString(),
          resolution_note: `Resuelto via Maven Asistente: ${note}`,
        })
        .eq("id", id)
        .eq("group_id", ctx.groupId);
      if (error) return { error: error.message };
      return { ok: true };
    }

    case "snooze_commitment": {
      const id = String(input.commitment_id ?? "");
      const hours = Number(input.hours ?? 24);
      if (!id) return { error: "missing_commitment_id" };
      const newDue = new Date(Date.now() + hours * 3600 * 1000).toISOString();
      const { error } = await sb
        .from("whatsapp_commitments")
        .update({ due_at: newDue, status: "pending" })
        .eq("id", id)
        .eq("group_id", ctx.groupId);
      if (error) return { error: error.message };
      return { ok: true, new_due_at: newDue };
    }

    case "reply_to_group": {
      const body = String(input.body ?? "").trim();
      if (!body) return { error: "empty_body" };
      // Llamamos a whatsapp-send para que despache.
      const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/whatsapp-send`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Cron-Token": Deno.env.get("CRON_INTERNAL_TOKEN") ?? "",
        },
        body: JSON.stringify({ group_id: ctx.groupId, body }),
      });
      const data = await resp.json();
      return data as Record<string, unknown>;
    }

    default:
      return { error: `unknown_tool:${name}` };
  }
}

// ----------------------------------------------------------------------------
// Build initial user message
// ----------------------------------------------------------------------------
async function buildInitialUserMessage(args: {
  req: AgentRequest;
  groupId: string;
  groupName: string;
  timezone: string;
}): Promise<string> {
  const lines: string[] = [];
  lines.push(`Grupo: ${args.groupName}`);
  lines.push(`Timezone: ${args.timezone}`);
  lines.push(`Hora actual: ${new Date().toISOString()}`);
  lines.push("");

  if (args.req.report_kind) {
    lines.push(`Tarea: generar un reporte ${args.req.report_kind}.`);
    lines.push(
      "Incluí: compromisos cumplidos, vencidos, top contributors, leads movidos. " +
        "Empezá usando list_commitments y search_messages para juntar datos. " +
        "Resumen final via reply_to_group, conciso (5-8 bullets máx).",
    );
    return lines.join("\n");
  }

  if (args.req.message_id) {
    const sb = adminClient();
    const { data: msg } = await sb
      .from("whatsapp_messages")
      .select("sender_display_name, body, transcribed_text, msg_type, sent_at")
      .eq("id", args.req.message_id)
      .single();
    const { data: ctx } = await sb
      .from("whatsapp_messages")
      .select("sender_display_name, body, transcribed_text, msg_type, sent_at")
      .eq("group_id", args.groupId)
      .lt("sent_at", msg?.sent_at ?? new Date().toISOString())
      .order("sent_at", { ascending: false })
      .limit(10);

    // Helper local: texto efectivo del mensaje (transcribed_text para
    // audios/imágenes cuando ya está procesado, body en otro caso).
    const effectiveText = (m: {
      body: string | null;
      transcribed_text: string | null;
      msg_type: string;
    }) => {
      if ((m.msg_type === "audio" || m.msg_type === "image") && m.transcribed_text) {
        const prefix = m.msg_type === "audio" ? "[audio]" : "[imagen]";
        return `${prefix} ${m.transcribed_text}`;
      }
      return m.body;
    };

    lines.push("Contexto reciente (orden cronológico):");
    for (const m of (ctx ?? []).reverse()) {
      const text = effectiveText(m);
      if (text) lines.push(`[${m.sent_at}] ${m.sender_display_name}: ${text}`);
    }
    lines.push("");
    lines.push("Mensaje al cual debés responder:");
    if (msg) {
      lines.push(`[${msg.sent_at}] ${msg.sender_display_name}: ${effectiveText(msg)}`);
    }
    lines.push("");
    lines.push(
      "Razoná, usá las tools que hagan falta y respondé al grupo via reply_to_group. " +
        "No respondas en el thinking — solo via reply_to_group.",
    );
    return lines.join("\n");
  }

  if (args.req.user_question) {
    lines.push("Pregunta del usuario (vino del panel admin, no del grupo):");
    lines.push(args.req.user_question);
    lines.push("");
    lines.push(
      "Razoná y respondé via reply_to_group. Si la pregunta no es relevante para el grupo, " +
        "respondé de todos modos pero corto.",
    );
    return lines.join("\n");
  }

  lines.push("Tarea: hacé un mini-resumen del estado del grupo. " +
    "Llamá list_commitments para ver pendientes, y respondé via reply_to_group.");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Run the agent loop
// ----------------------------------------------------------------------------
async function runAgent(req: AgentRequest): Promise<{
  ok: boolean;
  iterations?: number;
  final_reply?: string;
  error?: string;
}> {
  const sb = adminClient();

  // Resolver group_id si vino message_id en su lugar.
  let groupId = req.group_id;
  if (!groupId && req.message_id) {
    const { data: m } = await sb
      .from("whatsapp_messages")
      .select("group_id")
      .eq("id", req.message_id)
      .single();
    groupId = m?.group_id;
  }

  if (!groupId) return { ok: false, error: "missing_group_id" };

  const { data: group } = await sb
    .from("whatsapp_groups")
    .select("id, tenant_id, name, timezone, active, bot_enabled, bot_persona")
    .eq("id", groupId)
    .single();

  if (!group) return { ok: false, error: "group_not_found" };
  if (!group.active) return { ok: false, error: "group_inactive" };

  await logEvent(sb, {
    tenantId: group.tenant_id,
    groupId: group.id,
    kind: "agent_invoked",
    payload: { req, invoked_by: req.invoked_by },
  });

  const systemPrompt = group.bot_persona
    ? `${SYSTEM_PROMPT}\n\nPersonalización del grupo:\n${group.bot_persona}`
    : SYSTEM_PROMPT;

  const initialUser = await buildInitialUserMessage({
    req,
    groupId: group.id,
    groupName: group.name,
    timezone: group.timezone,
  });

  // Loop messages array per Anthropic spec.
  const messages: Array<Record<string, unknown>> = [
    { role: "user", content: initialUser },
  ];

  const startedAt = Date.now();
  let finalReply: string | null = null;
  let iter = 0;
  const totalUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  for (; iter < MAX_ITERATIONS; iter += 1) {
    if (Date.now() - startedAt > MAX_WALL_MS) break;

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { ok: false, error: `anthropic ${resp.status}: ${txt.slice(0, 200)}`, iterations: iter };
    }

    const data = await resp.json() as {
      content: Array<Record<string, unknown>>;
      stop_reason: string;
      usage: Record<string, number>;
    };

    // acumular usage
    for (const k of Object.keys(totalUsage) as Array<keyof typeof totalUsage>) {
      totalUsage[k] += (data.usage?.[k] ?? 0);
    }

    const toolUses = data.content.filter((b) => b.type === "tool_use");
    const replyText = data.content
      .filter((b) => b.type === "text")
      .map((b) => String(b.text ?? ""))
      .join("\n")
      .trim();

    if (toolUses.length === 0) {
      // No tools llamadas. Si el modelo escribió texto y no llamó
      // reply_to_group, lo mandamos nosotros (fallback).
      if (replyText) {
        await executeTool("reply_to_group", { body: replyText }, {
          groupId: group.id,
          tenantId: group.tenant_id,
        });
        finalReply = replyText;
      }
      messages.push({ role: "assistant", content: data.content });
      break;
    }

    messages.push({ role: "assistant", content: data.content });

    const toolResults: Array<Record<string, unknown>> = [];
    for (const t of toolUses) {
      const result = await executeTool(
        String(t.name),
        (t.input as ToolInput) ?? {},
        { groupId: group.id, tenantId: group.tenant_id },
      );
      if (t.name === "reply_to_group") {
        finalReply = String((t.input as ToolInput).body ?? "");
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: t.id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }

    messages.push({ role: "user", content: toolResults });

    // Si el modelo llamó reply_to_group exitosamente, salimos.
    if (finalReply) break;
  }

  await logAnthropicUsage({
    operation: "whatsapp_agent",
    model: MODEL,
    usage: totalUsage,
    tenantId: group.tenant_id,
    context: { group_id: group.id, iterations: iter + 1, invoked_by: req.invoked_by },
  });

  return {
    ok: true,
    iterations: iter + 1,
    final_reply: finalReply ?? undefined,
  };
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

  let body: AgentRequest;
  try {
    body = (await req.json()) as AgentRequest;
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
      status: 400,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  }

  try {
    const result = await runAgent(body);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { ...whatsappCors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...whatsappCors, "Content-Type": "application/json" } },
    );
  }
});
