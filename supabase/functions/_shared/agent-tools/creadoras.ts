// Dominio CREADORAS del catálogo (lectura).
import type { AgentTool } from "./types.ts";

export const creadorasTools: AgentTool[] = [
  {
    name: "search_creator",
    description:
      "Busca una creadora ACTIVA por nombre o handle de Instagram. Devuelve nombre, categoría, " +
      "Instagram, OnlyFans y otras redes cargadas.",
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
        .select("name, artistic_name, category, status, instagram_handle, onlyfans_url")
        .eq("status", "active")
        .or(`name.ilike.%${q}%,artistic_name.ilike.%${q}%,instagram_handle.ilike.%${q}%`)
        .limit(10);
      if (error) throw new Error(`search_creator: ${error.message}`);
      return data ?? [];
    },
  },
];
