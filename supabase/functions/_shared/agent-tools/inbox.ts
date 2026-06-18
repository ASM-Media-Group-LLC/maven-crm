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
// SOLO TEXTO por ahora: los audios/imágenes de la bandeja todavía no se transcriben
// (Slice 2, forward-only). Se marcan como "[audio/imagen — sin transcribir]" para que
// el bot sepa que hay media que aún no puede leer.
import type { AgentTool } from "./types.ts";

const MAX_MESSAGES = 30;
const MAX_CHARS_PER_MSG = 600;

function sanitize(q: string): string {
  return q.replace(/^@+/, "").replace(/[,()%]/g, " ").trim();
}

export const inboxTools: AgentTool[] = [
  {
    name: "get_model_whatsapp_context",
    description:
      "Lee la conversación de WhatsApp (bandeja) que el equipo tiene con una modelo/lead, por " +
      "nombre o @handle. Úsala cuando necesites contexto o estrategia sobre una modelo: trae los " +
      "últimos mensajes (texto) y el canal/marca por el que se la contactó (Kash, BLU, CP, etc.). " +
      "Si no hay conversación registrada, lo dice. Audios e imágenes todavía no se transcriben.",
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

      const { data: ccByHandle } = await ctx.sb
        .from("closer_creators")
        .select("id, instagram_handle")
        .ilike("instagram_handle", `%${q}%`)
        .limit(10);
      (ccByHandle ?? []).forEach((c: { id: string }) => ccIds.add(c.id));

      const { data: contacts } = await ctx.sb
        .from("closers_contacts")
        .select("id, name, handle")
        .or(`name.ilike.%${q}%,handle.ilike.%${q}%`)
        .limit(10);
      if (contacts?.length) {
        displayName = (contacts[0] as { name?: string }).name ?? null;
        const { data: ccBySrc } = await ctx.sb
          .from("closer_creators")
          .select("id, source_contact_id")
          .in("source_contact_id", contacts.map((c: { id: string }) => c.id))
          .limit(20);
        (ccBySrc ?? []).forEach((c: { id: string }) => ccIds.add(c.id));
      }

      if (ccIds.size === 0) return { found: false, reason: "modelo_no_encontrada_en_pipeline", query: q };

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
        };
      }
      if (!displayName) displayName = (waContacts[0] as { display_name?: string }).display_name ?? null;

      // 3) Conversación más reciente de esos contactos + su canal (= marca/compañía).
      const { data: convs } = await ctx.sb
        .from("wa_conversations")
        .select("id, channel_id, last_message_at, status")
        .in("contact_id", waContacts.map((c: { id: string }) => c.id))
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (!convs?.length) return { found: false, reason: "sin_conversacion", modelo: displayName ?? q };
      const conv = convs[0] as { id: string; channel_id: string | null; last_message_at: string | null; status: string | null };

      let canalMarca: string | null = null;
      if (conv.channel_id) {
        const { data: ch } = await ctx.sb
          .from("wa_channels").select("label").eq("id", conv.channel_id).maybeSingle();
        canalMarca = (ch as { label?: string } | null)?.label ?? null;
      }

      // 4) Últimos N mensajes (orden cronológico). Audio/imagen aún no transcritos → marcados.
      const { data: rows } = await ctx.sb
        .from("wa_conversation_messages")
        .select("direction, body, msg_type, sent_at")
        .eq("conversation_id", conv.id)
        .is("deleted_at", null)
        .order("sent_at", { ascending: false })
        .limit(MAX_MESSAGES);

      const mensajes = (rows ?? [])
        .slice()
        .reverse()
        .map((m: { direction: string; body: string | null; msg_type: string; sent_at: string }) => {
          // body trae el texto (text) o la transcripción/descripción (audio/imagen, vía
          // wa-inbox-transcribe). Si sigue vacío o es placeholder "[tipo...]", la media
          // todavía no se procesó.
          const b = (m.body ?? "").trim();
          const placeholder = !b || /^\[(audio|imagen|image|video|sticker|documento|document)[^\]]*\]$/i.test(b);
          return {
            de: m.direction === "out" ? "nosotros" : "modelo",
            cuando: m.sent_at,
            texto: placeholder ? `[${m.msg_type} — sin transcribir]` : b.slice(0, MAX_CHARS_PER_MSG),
          };
        });

      return {
        found: true,
        modelo: displayName ?? q,
        canal_marca: canalMarca,
        ultimo_mensaje: conv.last_message_at,
        estado_conversacion: conv.status,
        mensajes_traidos: mensajes.length,
        mensajes,
        nota: "Solo texto: los audios e imágenes de la bandeja todavía no se transcriben.",
      };
    },
  },
];
