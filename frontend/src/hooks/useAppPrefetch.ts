import { useEffect, useRef } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";

// Prefetch en idle de los chunks de módulos a los que el user tiene acceso.
//
// La estrategia: después que cargan permissions + role, dispara un `import()`
// dinámico de UNA página por módulo accesible. Vite resuelve cada import al
// chunk correspondiente (`mod-hr`, `mod-finanzas`, etc.) gracias al
// manualChunks configurado en vite.config.ts — bajando UN import del módulo
// se descarga el chunk entero, incluyendo TODAS las páginas de ese módulo.
//
// Por qué un solo import por módulo: las páginas DENTRO del mismo chunk
// quedan en el mismo bundle, así que con descargar una se cachean todas.
//
// Usamos `requestIdleCallback` para no bloquear el primer paint del
// dashboard. Si el browser no soporta (Safari viejo), fallback a setTimeout.
//
// Cuando el user clickea "HR" / "Finanzas" / etc. el chunk ya está cacheado
// → React lazy(() => import(...)) resuelve sincronamente desde memoria.

type ModuleKey =
  | "hr"
  | "finanzas"
  | "creadores"
  | "eventos"
  | "chatter"
  | "scouter"
  | "agency-qa"
  | "proyectomp"
  | "sales"
  | "leadgen"
  | "promolog"
  | "messenger"
  | "closers"
  | "tareas"
  | "contactos"
  | "cowork"
  | "supercontacts"
  | "admin"
  | "dashboard"
  | "tickets";

// Loaders estáticos — Vite analiza estos imports y los ata a los chunks
// declarados en manualChunks. NO usar strings dinámicos acá (Vite no
// los puede resolver).
const MODULE_LOADERS: Record<ModuleKey, () => Promise<unknown>> = {
  hr: () => import("../pages/hr/HRDashboard"),
  finanzas: () => import("../pages/finanzas/FinanzasDashboard"),
  creadores: () => import("../pages/Creadores"),
  eventos: () => import("../pages/Eventos"),
  chatter: () => import("../pages/ChatterEvaluator"),
  scouter: () => import("../pages/scouter/ScouterAssist"),
  "agency-qa": () => import("../pages/agency-qa/AgencyQA"),
  proyectomp: () => import("../pages/proyectomp/ProyectoMPDashboard"),
  sales: () => import("../pages/SalesOverview"),
  leadgen: () => import("../pages/LeadGen"),
  promolog: () => import("../pages/Promolog"),
  messenger: () => import("../pages/Messenger"),
  closers: () => import("../pages/Closers"),
  tareas: () => import("../pages/Tareas"),
  contactos: () => import("../pages/Contactos"),
  cowork: () => import("../pages/cowork/CoworkPage"),
  supercontacts: () => import("../pages/SuperContacts"),
  admin: () => import("../pages/admin/AdminUsuarios"),
  dashboard: () => import("../pages/Dashboard"),
  tickets: () => import("../pages/Tickets"),
};

// Mapeo módulo → check de permiso. usePermissions().canAccess(module) decide.
const MODULE_PERMISSIONS: Record<ModuleKey, { module: string; submodule?: string }> = {
  hr: { module: "HR" },
  finanzas: { module: "Finanzas" },
  creadores: { module: "Creadores" },
  eventos: { module: "Eventos" },
  chatter: { module: "Chatters" },
  scouter: { module: "Scouter Assist" },
  "agency-qa": { module: "Agency QA" },
  proyectomp: { module: "ProyectoMP" },
  sales: { module: "Creator Sales" },
  leadgen: { module: "LeadGen" },
  promolog: { module: "Promolog" },
  messenger: { module: "Messenger" },
  closers: { module: "Closers" },
  tareas: { module: "Tareas" },
  contactos: { module: "Contactos" },
  cowork: { module: "Cowork" },
  supercontacts: { module: "SuperContacts" },
  admin: { module: "Admin" }, // Admin se gatea con role check abajo, no por permiso
  dashboard: { module: "Dashboard" }, // universal pero el chunk vale prefetchearlo
  tickets: { module: "Tickets" },
};

// `requestIdleCallback` con fallback para Safari.
const onIdle = (cb: () => void, timeout = 2000): number => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, opts: { timeout: number }) => number }).requestIdleCallback;
  if (typeof ric === "function") return ric(cb, { timeout });
  return window.setTimeout(cb, 300);
};

export const useAppPrefetch = () => {
  const { canAccess, isLoading } = usePermissions();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  // Una sola pasada — si vuelve a re-renderizar no re-prefetchea.
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    if (isLoading || roleLoading) return;
    startedRef.current = true;

    // Lista de módulos que el user puede acceder.
    const accessible: ModuleKey[] = [];
    for (const [key, perm] of Object.entries(MODULE_PERMISSIONS) as [ModuleKey, { module: string; submodule?: string }][]) {
      // Admin module: sólo admins reales lo prefetchean.
      if (key === "admin") {
        if (isAdmin) accessible.push(key);
        continue;
      }
      if (canAccess(perm.module, perm.submodule)) {
        accessible.push(key);
      }
    }

    // Prefetch en cascada — uno cada ~150ms para no saturar la red ni
    // competir con queries iniciales del shell. Cada uno corre en idle
    // así que se cancelan/postergan si el browser está ocupado.
    accessible.forEach((key, i) => {
      onIdle(() => {
        const loader = MODULE_LOADERS[key];
        if (loader) {
          // Fire-and-forget. Si falla (network blip), el lazy() retry
          // del navegador cuando el user navega lo va a re-pedir.
          loader().catch(() => {
            // silent — no es crítico que un prefetch falle
          });
        }
      }, 2000 + i * 150);
    });
  }, [isLoading, roleLoading, canAccess, isAdmin]);
};

export default useAppPrefetch;
