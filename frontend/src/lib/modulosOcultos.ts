// INTERRUPTOR DE RECORTE (Alvaro, 30/10/2026).
//
// Apaga y ESCONDE áreas enteras del equipo sin borrar nada: la data sigue en la
// base, el código sigue acá, solo deja de verse. Revivir = sacar la entrada de
// estos conjuntos y subir. Pensado para recortar con un cambio de una línea, no
// para configurarse por rol (eso ya lo hace la pantalla de Roles).
//
// POR QUÉ ACÁ Y NO EN PERMISOS POR ROL: "Dashboard" es universal (lo ve todo el
// mundo) y los tableros de Ventas de Blu cuelgan del módulo "Creator Sales", que
// no se puede apagar por rol sin enredar el dashboard principal. Un interruptor
// de código, parejo para todos (menos el admin), es más simple y 100% reversible.
//
// CÓMO ESCONDE: lo consume usePermissions.canAccess —el ÚNICO cuello por el que
// pasan el menú lateral (filtra por canAccess) y las rutas (PermissionRoute)—,
// DESPUÉS del chequeo de admin, así el admin los sigue viendo y el equipo no.

/**
 * Módulos apagados para el equipo (no para el admin). El nombre es el `module`
 * del sistema de permisos (ver navCatalog / PermissionRoute).
 *
 * - "Creadores": listado, dashboard, onboarding, offboarding, perfil y los
 *   accesos de OnlyFans (viven dentro del perfil y del portal).
 * - "Creator Sales": los tableros de Ventas que viven de la data de Blu
 *   (Dashboard 2, retención de fans, cohortes, top fans). El landing /dashboard
 *   solo los embebe si canAccess("Creator Sales") → con esto el equipo cae al
 *   dashboard normal, sin rebote.
 */
export const MODULOS_OCULTOS: ReadonlySet<string> = new Set<string>([
  "Creadores",
  "Creator Sales",
]);

/** ¿Está este módulo apagado por el recorte? */
export const esModuloOculto = (module: string): boolean => MODULOS_OCULTOS.has(module);

/**
 * Portal de creadoras cerrado. Mientras sea `true`, ninguna creadora entra ni
 * opera el portal (ve un aviso de cerrado); el equipo que caiga ahí vuelve a su
 * Maven. Nada se borra: reabrir = poner `false`. Aparte de MODULOS_OCULTOS
 * porque el portal es un login externo, no un módulo del CRM.
 */
export const PORTAL_CERRADO: boolean = true;
