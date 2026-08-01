// Dominio LEADS — contexto de la BANDEJA de WhatsApp (lectura).
//
// get_model_whatsapp_context: cuando el bot habla de una modelo/lead, busca SI hay
// una conversación 1:1 con ella en la bandeja y devuelve el contexto escrito (últimos
// mensajes) + el canal/marca por el que se la contactó. Así el bot toma contexto real
// "sin que nadie le diga".
//
// Resolver (confiado, ver auditoría 2026-06-18): modelo → closer_creator →
// wa_contacts.closer_creator_id → conversación (es el link directo que setea
// wa-inbox-open, cobertura ~75% y subiendo). Se resuelve la modelo por handle del
// pipeline (closer_creators.instagram_handle) o por nombre/handle del contacto
// (closers_contacts), y de ahí a sus closer_creator_id.
//
// MULTIMODAL: el texto, los audios (Whisper, vía wa-inbox-transcribe) y las imágenes
// (visión Gemini/OpenRouter, vía wa-inbox-analyze-image) de la bandeja se leen desde
// `body`. La media que todavía no se procesó (o que es irrecuperable) se marca como
// "[tipo — sin transcribir]" para que el bot sepa que hay algo que aún no puede leer.
import type { AgentCtx, AgentTool } from "./types.ts";

const MAX_MESSAGES = 30;

// ── CANDADO DE LÍNEA DE BANDEJA ──────────────────────────────────────────────
// Antes cada tool de bandeja resolvía la línea con `args.department ?? algo`, o
// sea que el MODELO elegía qué bandeja leer: el bot de Managers podía leer la de
// closers con solo pedirlo, y get_contact_messages defaulteaba a 'manager' para
// TODOS los bots. Ahora la lista permitida la fija el bot en DB
// (wa_bots.inbox_departments) y lo que pida el modelo se valida contra ella.
//
// No se deriva del `department` del bot: no existe ninguna wa_channels 'sales' y
// el bot de Ventas (department='sales') tiene que leer la línea de 'closer'
// porque M/V es el grupo de closers. Por eso el permiso va explícito en DB.
//
// Vive acá y lo usan TANTO el catálogo como las tools inline de whatsapp-agent,
// a propósito: son dos archivos distintos y una copia pegada se desincroniza.
export type LineaResuelta =
  | { ok: true; dept: string; permitidos: string[] }
  | { ok: false; motivo: Record<string, unknown> };

export function resolverLineaBandeja(
  pedido: unknown,
  ctx: Pick<AgentCtx, "department" | "inboxDepartments">,
): LineaResuelta {
  // undefined ⇒ no declarado ⇒ conservador: solo su propio department.
  // [] ⇒ declarado explícitamente como "este bot no lee bandeja".
  const permitidos = (ctx.inboxDepartments ?? (ctx.department ? [ctx.department] : []))
    .map((d) => String(d).trim()).filter(Boolean);
  if (permitidos.length === 0) {
    return { ok: false, motivo: { found: false, reason: "bandeja_no_habilitada",
      nota: "Este bot no tiene línea de bandeja asignada. No inventes el contenido: di que no tienes acceso a esa bandeja." } };
  }
  const q = String(pedido ?? "").trim().toLowerCase();
  if (q && !permitidos.includes(q)) {
    // Se devuelve el motivo en vez de leer otra línea en silencio: si el modelo
    // cree que leyó 'closer' y en realidad leyó 'manager', reporta los datos de
    // la línea equivocada como si fueran los que le pidieron.
    return { ok: false, motivo: { found: false, reason: "linea_no_permitida", pedido: q, permitidos,
      nota: `Este bot solo puede leer la bandeja de: ${permitidos.join(", ")}. No tiene acceso a '${q}' — dilo así, sin inventar datos.` } };
  }
  return { ok: true, dept: q || permitidos[0], permitidos };
}
const MAX_CHARS_PER_MSG = 600;

function sanitize(q: string): string {
  return q.replace(/^@+/, "").replace(/[,()%]/g, " ").trim();
}

// Nombre a mostrar de un contacto de la bandeja: rename manual > nombre resuelto
// contra Maven (creadora/contacto por teléfono) > push-name de WhatsApp > @IG.
function contactName(ct: {
  manual_name?: string | null; resolved_name?: string | null;
  display_name?: string | null; instagram_handle?: string | null;
} | null | undefined): string {
  if (!ct) return "(sin nombre)";
  return (ct.manual_name || ct.resolved_name || ct.display_name ||
    (ct.instagram_handle ? "@" + ct.instagram_handle.replace(/^@/, "") : "") || "(sin nombre)");
}

// Últimos mensajes de una conversación en orden cronológico. La media aún no
// transcrita/analizada queda marcada "[tipo — sin transcribir]".
async function fetchMessages(sb: AgentCtx["sb"], conversationId: string) {
  const { data: rows } = await sb
    .from("wa_conversation_messages")
    .select("direction, body, msg_type, sent_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("sent_at", { ascending: false })
    .limit(MAX_MESSAGES);
  return (rows ?? [])
    .slice()
    .reverse()
    .map((m: { direction: string; body: string | null; msg_type: string; sent_at: string }) => {
      const b = (m.body ?? "").trim();
      const placeholder = !b || /^\[(audio|imagen|image|video|sticker|documento|document)[^\]]*\]$/i.test(b);
      return {
        de: m.direction === "out" ? "nosotros" : "contacto",
        cuando: m.sent_at,
        texto: placeholder ? `[${m.msg_type} — sin transcribir]` : b.slice(0, MAX_CHARS_PER_MSG),
      };
    });
}

export const inboxTools: AgentTool[] = [
  {
    name: "get_model_whatsapp_context",
    description:
      "Lee la conversación de WhatsApp (bandeja) que el equipo tiene con una modelo/lead, por " +
      "nombre o @handle. Úsala cuando necesites contexto o estrategia sobre una modelo: trae los " +
      "últimos mensajes y el canal/marca por el que se la contactó (Kash, BLU, CP, etc.). Incluye el " +
      "texto, la transcripción de los audios y la descripción/OCR de las imágenes (comprobantes, " +
      "screenshots, etc.). Si no hay conversación registrada, lo dice.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "nombre o @handle de la modelo/lead" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    domain: "leads",
    scope: "read",
    handler: async (args, ctx) => {
      const q = sanitize(String(args.query ?? ""));
      if (!q) return { found: false, reason: "query_vacia" };

      // 1) Candidatos de closer_creator: por handle del pipeline + por nombre/handle del contacto.
      const ccIds = new Set<string>();
      let displayName: string | null = null;

      // lead_source/deal_type: de qué BASE viene el lead (maven / ex_creadora /
      // agencia). El bot lo necesita para no tratar a una agencia B2B como si
      // fuera una modelo a reclutar.
      let leadBase: string | null = null;
      let leadDealType: string | null = null;
      let contactKind: string | null = null;

      const { data: ccByHandle } = await ctx.sb
        .from("closer_creators")
        .select("id, instagram_handle, lead_source, deal_type")
        .ilike("instagram_handle", `%${q}%`)
        .limit(10);
      if (ccByHandle?.length) {
        leadBase = (ccByHandle[0] as { lead_source?: string }).lead_source ?? "maven";
        leadDealType = (ccByHandle[0] as { deal_type?: string }).deal_type ?? null;
      }
      (ccByHandle ?? []).forEach((c: { id: string }) => ccIds.add(c.id));

      const { data: contacts } = await ctx.sb
        .from("closers_contacts")
        .select("id, name, handle, contact_kind")
        .or(`name.ilike.%${q}%,handle.ilike.%${q}%`)
        .limit(10);
      if (contacts?.length) {
        displayName = (contacts[0] as { name?: string }).name ?? null;
        contactKind = (contacts[0] as { contact_kind?: string }).contact_kind ?? "modelo";
        const { data: ccBySrc } = await ctx.sb
          .from("closer_creators")
          .select("id, source_contact_id")
          .in("source_contact_id", contacts.map((c: { id: string }) => c.id))
          .limit(20);
        (ccBySrc ?? []).forEach((c: { id: string }) => ccIds.add(c.id));
      }

      if (ccIds.size === 0) {
        return {
          found: false,
          reason: "modelo_no_encontrada_en_pipeline",
          query: q,
          // Puede existir como CONTACTO sin estar todavía en el pipeline.
          tipo_de_contacto: contactKind,
        };
      }

      // 2) wa_contacts por el link directo (closer_creator_id).
      const { data: waContacts } = await ctx.sb
        .from("wa_contacts")
        .select("id, display_name, closer_creator_id")
        .in("closer_creator_id", [...ccIds])
        .limit(20);
      if (!waContacts?.length) {
        return {
          found: false,
          reason: "sin_conversacion_de_whatsapp_registrada",
          modelo: displayName ?? q,
          base_del_lead: leadBase,
          tipo_de_contacto: contactKind,
        };
      }
      if (!displayName) displayName = (waContacts[0] as { display_name?: string }).display_name ?? null;

      // 3) Conversación más reciente de esos contactos + su canal (= marca/compañía).
      const { data: convs } = await ctx.sb
        .from("wa_conversations")
        .select("id, channel_id, last_message_at, status, summary, summary_updated_at")
        .in("contact_id", waContacts.map((c: { id: string }) => c.id))
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (!convs?.length) return { found: false, reason: "sin_conversacion", modelo: displayName ?? q };
      const conv = convs[0] as { id: string; channel_id: string | null; last_message_at: string | null; status: string | null; summary: string | null; summary_updated_at: string | null };

      let canalMarca: string | null = null;
      let canalDept: string | null = null;
      if (conv.channel_id) {
        const { data: ch } = await ctx.sb
          .from("wa_channels").select("label, department").eq("id", conv.channel_id).maybeSingle();
        canalMarca = (ch as { label?: string } | null)?.label ?? null;
        canalDept = (ch as { department?: string } | null)?.department ?? null;
      }

      // 4) Últimos N mensajes (orden cronológico). Audio/imagen aún no transcritos → marcados.
      const mensajes = await fetchMessages(ctx.sb, conv.id);

      return {
        found: true,
        modelo: displayName ?? q,
        // De qué BASE viene: maven (LeadGen/Contactos) · ex_creadora (ya trabajó
        // con la agencia: el cierre se hace con Reactivar) · agencia (B2B: se le
        // vende producto, NO se la recluta como modelo).
        base_del_lead: leadBase,
        tipo_de_deal: leadDealType,
        tipo_de_contacto: contactKind,
        canal_marca: canalMarca,
        departamento: canalDept,
        ultimo_mensaje: conv.last_message_at,
        estado_conversacion: conv.status,
        // Resumen rolling (narrativa de toda la relación, generado por wa-conversation-summarize).
        // Útil para conversaciones largas donde los últimos 30 mensajes no alcanzan a dar el contexto completo.
        resumen: conv.summary ?? null,
        resumen_actualizado: conv.summary_updated_at ?? null,
        mensajes_traidos: mensajes.length,
        mensajes,
        nota: "Incluye texto, transcripción de audios (Whisper) y descripción/OCR de imágenes (visión). " +
          "Lo que aparezca como '[tipo — sin transcribir]' es media que aún no se procesó.",
      };
    },
  },
  {
    name: "get_department_conversations",
    description:
      "Lee la BANDEJA de WhatsApp de una LÍNEA/DEPARTAMENTO (ej. la línea de las Managers), con el " +
      "nombre REAL de cada contacto ya resuelto contra Maven. A diferencia de get_model_whatsapp_context " +
      "(que sólo encuentra modelos linkeadas del pipeline), esta ve TODAS las conversaciones de la línea, " +
      "incluidas las que no están vinculadas a una creadora. Sin `contact` → lista las conversaciones " +
      "recientes de la línea (nombre, marca, último mensaje, no leídos). Con `contact` → trae los últimos " +
      "mensajes de ESA conversación. La línea que puedes leer está FIJADA para tu bot: normalmente no " +
      "hace falta pasar `department`. Si pides una que no te corresponde, la tool la rechaza — en ese " +
      "caso di que no tienes acceso a esa bandeja, nunca inventes su contenido.",
    input_schema: {
      type: "object",
      properties: {
        department: { type: "string", description: "opcional y normalmente innecesario: la línea permitida ya viene fijada por tu bot. Solo úsalo si tu bot tiene más de una." },
        contact: { type: "string", description: "opcional: nombre/@handle (o parte) para abrir UNA conversación y leer sus mensajes" },
        limit: { type: "number", description: "máximo de conversaciones a listar (default 20, tope 50)" },
      },
      additionalProperties: false,
    },
    domain: "leads",
    scope: "read",
    handler: async (args, ctx) => {
      const linea = resolverLineaBandeja(args.department, ctx);
      if (!linea.ok) return linea.motivo;
      const dept = linea.dept;

      // Canales (líneas) de ese departamento.
      const { data: chans } = await ctx.sb
        .from("wa_channels").select("id, label").eq("department", dept).eq("active", true);
      if (!chans?.length) return { found: false, reason: "sin_lineas_para_ese_departamento", department: dept };
      const chanIds = (chans as Array<{ id: string }>).map((c) => c.id);
      const labelOf = new Map((chans as Array<{ id: string; label: string | null }>).map((c) => [c.id, c.label]));

      const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 50);
      const { data: convs } = await ctx.sb
        .from("wa_conversations")
        .select("id, contact_id, channel_id, last_message_at, last_message_preview, unread_count, status")
        .in("channel_id", chanIds)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(limit);
      if (!convs?.length) return { found: false, reason: "sin_conversaciones", department: dept };

      // Nombres resueltos (columnas ya cacheadas por el trigger de resolución).
      const contactIds = (convs as Array<{ contact_id: string | null }>).map((c) => c.contact_id).filter(Boolean) as string[];
      const { data: cts } = await ctx.sb
        .from("wa_contacts")
        .select("id, manual_name, resolved_name, display_name, instagram_handle")
        .in("id", contactIds);
      const ctById = new Map((cts ?? []).map((c: { id: string }) => [c.id, c]));
      const nameOf = (id: string | null) => contactName(id ? ctById.get(id) as any : null);

      // Modo "abrir una conversación puntual": matchea por nombre resuelto.
      const contactQ = sanitize(String(args.contact ?? ""));
      if (contactQ) {
        const needle = contactQ.toLowerCase();
        const match = (convs as Array<{ id: string; contact_id: string | null; channel_id: string | null; last_message_at: string | null }>)
          .find((c) => nameOf(c.contact_id).toLowerCase().includes(needle));
        if (!match) {
          return { found: false, reason: "contacto_no_encontrado_en_la_linea", department: dept, query: contactQ };
        }
        const mensajes = await fetchMessages(ctx.sb, match.id);
        return {
          found: true, department: dept,
          linea: match.channel_id ? labelOf.get(match.channel_id) ?? null : null,
          contacto: nameOf(match.contact_id),
          ultimo_mensaje: match.last_message_at,
          mensajes_traidos: mensajes.length,
          mensajes,
          nota: "Nombre resuelto contra Maven. '[tipo — sin transcribir]' = media aún sin procesar.",
        };
      }

      // Modo lista.
      return {
        found: true,
        department: dept,
        lineas: (chans as Array<{ label: string | null }>).map((c) => c.label).filter(Boolean),
        total: convs.length,
        conversaciones: (convs as Array<{ contact_id: string | null; channel_id: string | null; last_message_at: string | null; last_message_preview: string | null; unread_count: number | null; status: string | null }>).map((c) => ({
          contacto: nameOf(c.contact_id),
          linea: c.channel_id ? labelOf.get(c.channel_id) ?? null : null,
          ultimo_mensaje: c.last_message_at,
          preview: (c.last_message_preview ?? "").slice(0, 160),
          no_leidos: c.unread_count ?? 0,
          estado: c.status,
        })),
        nota: "Para leer los mensajes de una conversación puntual, llama de nuevo con `contact`=<nombre>.",
      };
    },
  },
];
