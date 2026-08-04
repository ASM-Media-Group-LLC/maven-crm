// Dominio CREADORAS del catálogo (lectura).
import type { AgentTool } from "./types.ts";

export const creadorasTools: AgentTool[] = [
  {
    name: "search_creator",
    description:
      "Busca una creadora por nombre o handle de Instagram. Devuelve nombre, categoría, " +
      "Instagram, OnlyFans y otras redes cargadas. Si `rejoined_at` viene con fecha, la creadora " +
      "es REINGRESADA (ya había sido creadora de la agencia antes y volvió) — menciónalo si es relevante. " +
      "Tolera espacios y acentos ('Carolina Romo' encuentra a 'CarolinaRomo'). Si sale con status " +
      "distinto de 'active' (leaving/terminated), DILO — puede ser una baja o un reingreso sin aplicar.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "nombre o @handle a buscar" } },
      required: ["query"],
      additionalProperties: false,
    },
    domain: "leads",
    scope: "read",
    handler: async (args, ctx) => {
      // Sanitizar: el input va a un .or(ilike) — sacamos comas/paréntesis/% que romperían el parse.
      const q = String(args.query ?? "").replace(/^@+/, "").replace(/[,()%]/g, " ").trim();
      if (!q) return [];
      const { data, error } = await ctx.sb
        .from("creators")
        .select("name, artistic_name, category, status, instagram_handle, onlyfans_url, rejoined_at")
        .eq("status", "active")
        .or(`name.ilike.%${q}%,artistic_name.ilike.%${q}%,instagram_handle.ilike.%${q}%`)
        .limit(10);
      if (error) throw new Error(`search_creator: ${error.message}`);
      if ((data ?? []).length > 0) return data;
      // Fallback normalizado (04/08): "Carolina Romo" no matcheaba "CarolinaRomo" —
      // la gente escribe con espacios/acentos y la base los tiene pegados y sin
      // tilde. El RPC compara ambos lados normalizados e incluye NO-activas
      // (mejor decir "está pero con status leaving" que "no existe").
      const { data: fz } = await ctx.sb.rpc("search_creators_fuzzy", { p_q: q });
      const ids = (fz ?? []).map((r: { id: string }) => r.id);
      if (!ids.length) return [];
      const { data: full } = await ctx.sb
        .from("creators")
        .select("name, artistic_name, category, status, instagram_handle, onlyfans_url, rejoined_at")
        .in("id", ids);
      return full ?? [];
    },
  },
];
