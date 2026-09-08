// Manager de una creadora — la ÚNICA pieza para elegirla y guardarla.
//
// La usan la ficha completa (InfoTabContent) y el lápiz del Listado
// (EditCreadorModal): mismo pool de personas (rol manager, RPC
// get_assignable_managers), mismo select y mismo payload de guardado, así los dos
// caminos escriben lo mismo y el historial (trigger trg_creator_manager_history
// sobre creators.assigned_manager_profile_id) se alimenta igual desde cualquiera.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssignableManagers } from "@/hooks/useAssignableManagers";

export const SIN_MANAGER = "__none__";

// Se escriben LAS DOS columnas: assigned_manager_profile_id es la canónica (bot,
// RPCs, filtros); assigned_manager_id la leen ManagerDashboard y ventas_tops.
// Mantenerlas iguales evita el split-brain. "" = sin manager.
export const managerAssignmentPatch = (profileId: string | null | undefined) => ({
  assigned_manager_profile_id: profileId || null,
  assigned_manager_id: profileId || null,
});

interface Props {
  value: string | null | undefined;
  onChange: (profileId: string) => void;
  className?: string;
}

export function ManagerSelect({ value, onChange, className }: Props) {
  const { data: managers = [] } = useAssignableManagers();
  return (
    <Select value={value || SIN_MANAGER} onValueChange={(v) => onChange(v === SIN_MANAGER ? "" : v)}>
      <SelectTrigger className={className}><SelectValue placeholder="Seleccionar" /></SelectTrigger>
      <SelectContent>
        <SelectItem value={SIN_MANAGER}>Sin manager</SelectItem>
        {managers.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.id}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// Nombre de la manager asignada para mostrar (null si no tiene).
export function useManagerName(profileId: string | null | undefined): string | null {
  const { data: managers = [] } = useAssignableManagers();
  if (!profileId) return null;
  return managers.find((m) => m.id === profileId)?.full_name ?? "(fuera del rol manager)";
}
