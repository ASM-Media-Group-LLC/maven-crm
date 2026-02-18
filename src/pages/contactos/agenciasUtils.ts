import type { BadgeProps } from "@/components/ui/badge";

export interface Agencia {
  id: string;
  nombre: string;
  estado: string;
  pais: string;
  contacto_nombre: string;
  contacto_email: string;
  contacto_telefono: string;
  instagram: string;
  website: string;
  notas: string;
  created_at: string;
}

export const AGENCIA_ESTADOS = ["Discovery", "Contactada", "En Proceso", "Completada"] as const;

export const estadoAgenciaConfig: Record<string, { variant: BadgeProps["variant"]; className: string }> = {
  Discovery: { variant: "outline", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  Contactada: { variant: "outline", className: "bg-warning/20 text-warning border-warning/30" },
  "En Proceso": { variant: "outline", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  Completada: { variant: "outline", className: "bg-success/20 text-success border-success/30" },
};
