import { Settings, Bell, Radio, BarChart3, FileText, Moon } from "lucide-react";

export const TABS = [
  { id: "general", label: "General", icon: Settings },
  { id: "canales", label: "Canales", icon: Radio },
  { id: "eventos", label: "Eventos", icon: Bell },
  { id: "prioridad", label: "Prioridad", icon: BarChart3 },
  { id: "resumenes", label: "Resúmenes", icon: FileText },
  { id: "no-molestar", label: "No Molestar", icon: Moon },
] as const;

export type TabId = (typeof TABS)[number]["id"];
export const TAB_POR_DEFECTO: TabId = "general";

// La pestaña activa vive en la URL (/ajustes/notificaciones?tab=eventos): al
// refrescar, o al llegar por un enlace, se abre la misma. Antes era estado
// local y F5 devolvía siempre a General (Jhon, 06/09/2026).
export function tabDesdeUrl(param: string | null | undefined): TabId {
  return TABS.some((t) => t.id === param) ? (param as TabId) : TAB_POR_DEFECTO;
}

export function urlDeTab(tab: TabId): string {
  return tab === TAB_POR_DEFECTO ? "/ajustes/notificaciones" : `/ajustes/notificaciones?tab=${tab}`;
}
