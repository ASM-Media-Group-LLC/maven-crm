import { Settings, Bell, Radio, BarChart3, FileText, Moon } from "lucide-react";

// `id` viaja en la URL (?tab=…): es dato y no se traduce. Lo que se ve es `labelKey`.
export const TABS = [
  { id: "general", labelKey: "settings.notif.tab.general", icon: Settings },
  { id: "canales", labelKey: "settings.notif.tab.channels", icon: Radio },
  { id: "eventos", labelKey: "settings.notif.tab.events", icon: Bell },
  { id: "prioridad", labelKey: "settings.notif.tab.priority", icon: BarChart3 },
  { id: "resumenes", labelKey: "settings.notif.tab.digests", icon: FileText },
  { id: "no-molestar", labelKey: "settings.notif.tab.dnd", icon: Moon },
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
