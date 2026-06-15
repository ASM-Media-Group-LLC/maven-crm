// Catálogo CENTRAL de tools de los agentes de Maven.
//
// Todas las tools del CRM viven acá (agrupadas por dominio). Cada agente y el orquestador
// (Clari) eligen un subset con toolsFor(); el LLM recibe los esquemas con toAnthropicTools()
// y se ejecutan con runTool(). Sumar una tool = agregarla a su módulo de dominio; sumar un
// agente = elegir qué tools del catálogo le damos (config, no código).
import type { AgentCtx, AgentTool, ToolDomain, ToolScope } from "./types.ts";
import { promologTools } from "./promolog.ts";
import { monetizacionTools } from "./monetizacion.ts";
import { creadorasTools } from "./creadoras.ts";

export const TOOL_REGISTRY: AgentTool[] = [
  ...promologTools,
  ...monetizacionTools,
  ...creadorasTools,
  // Próximos dominios: ventas, equipo, qa (muchos saldrán de migrar las 25 tools
  // inline del whatsapp-agent).
];

const byName = new Map(TOOL_REGISTRY.map((t) => [t.name, t]));

/** Subset del catálogo por dominio(s) y/o scope — para armar el toolset de un agente. */
export function toolsFor(opts?: { domains?: ToolDomain[]; scopes?: ToolScope[] }): AgentTool[] {
  return TOOL_REGISTRY.filter((t) =>
    (!opts?.domains || opts.domains.includes(t.domain)) &&
    (!opts?.scopes || opts.scopes.includes(t.scope)),
  );
}

/** Esquemas en formato tool-use de Anthropic (lo que recibe el LLM). */
export function toAnthropicTools(tools: AgentTool[]) {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
}

/** ¿La tool existe en el catálogo? (para distinguir "no existe" de "falló el handler"). */
export function hasTool(name: string): boolean {
  return byName.has(name);
}

/** Ejecuta una tool por nombre. Lanza si no existe. */
export async function runTool(name: string, args: Record<string, unknown>, ctx: AgentCtx): Promise<unknown> {
  const tool = byName.get(name);
  if (!tool) throw new Error(`Tool desconocida: ${name}`);
  return tool.handler(args ?? {}, ctx);
}
