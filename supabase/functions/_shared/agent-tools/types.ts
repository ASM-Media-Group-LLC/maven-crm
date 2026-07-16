// Contrato del CATÁLOGO DE TOOLS de los agentes de Maven.
//
// Una "tool" = una acción concreta (leer o actuar) que un agente puede invocar sobre el
// CRM. El catálogo es la caja compartida: cada agente (bot de managers/closers/vendedores)
// y el orquestador (Clari) eligen un SUBSET por dominio/scope. Definidas una sola vez acá,
// reusadas por todas las edge functions de agentes.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ToolScope = "read" | "write";
export type ToolDomain = "promolog" | "ventas" | "leads" | "monetizacion" | "qa" | "equipo" | "managers";

// Contexto que recibe cada handler: cliente service-role + tenant + quién pregunta
// (para permisos/auditoría) + grupo si viene de WhatsApp + department del bot
// (para que las tools de bandeja se auto-scopeen a la línea del equipo: un bot
// de managers lee la línea de managers sin que nadie se lo diga).
export interface AgentCtx {
  sb: SupabaseClient;
  tenantId: string;
  userId?: string | null;
  groupId?: string | null;
  department?: string | null;
}

export interface AgentTool {
  name: string;
  description: string;
  // JSON Schema del input (formato tool-use de Anthropic).
  input_schema: Record<string, unknown>;
  domain: ToolDomain;
  scope: ToolScope;
  handler: (args: Record<string, unknown>, ctx: AgentCtx) => Promise<unknown>;
}
