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
  // Candado 2 (scoping por rol). Los propaga el whatsapp-agent al ejecutar tools
  // del catálogo para que puedan acotar por rol del remitente. privileged=false
  // ⇒ el remitente es un usuario NO privilegiado que mencionó al bot en un grupo
  // (closer/LLG/manager). undefined/true ⇒ contexto privilegiado (owner/admin/
  // supervisor, o corridas de sistema: digests/auto/DMs).
  privileged?: boolean;
  canSeePhones?: boolean;
  // Líneas de bandeja (wa_channels.department) que este bot puede leer. Va
  // explícito y NO derivado del `department` de arriba: el bot de Ventas es
  // 'sales' pero la línea que le toca es la de 'closer' (M/V es el grupo de
  // closers) y no existe ninguna línea 'sales'. undefined ⇒ solo su propio
  // department; [] ⇒ no lee bandeja. El modelo no puede salirse de la lista.
  inboxDepartments?: string[] | null;
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
