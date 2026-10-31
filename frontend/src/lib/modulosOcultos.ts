// RECORTE REVERSIBLE DEL MENÚ (Alvaro, 31/10/2026) — esconde módulos/submódulos
// enteros PARA EL EQUIPO sin borrar nada. El admin los sigue viendo (el chequeo
// corre DESPUÉS del bypass de admin en usePermissions.canAccess). Un solo cuello
// esconde menú y rutas de una vez. Revivir = sacar la entrada (o el submódulo del
// Set) y subir.
//
// Maven hoy reemplaza Hubstaff (el reloj/productividad vive en Cowork) y Google
// Suite (Correo + Oficina). Se deja el núcleo (Menú, Operaciones salvo Ventas y
// leads, Oficina) y se esconde lo que no se usa.
//
// Una entrada `true` esconde el módulo ENTERO. Una entrada con un Set esconde solo
// esos submódulos (los demás submódulos de ese módulo siguen visibles).

export const MODULOS_OCULTOS: Record<string, true | Set<string>> = {
  // Finanzas entero afuera.
  Finanzas: true,

  // Operaciones › "Ventas y leads" afuera (LeadGen, Closers, Scouter, Teléfonos).
  LeadGen: true,
  Closers: true,
  "Scouter Assist": true,
  Telefonos: true,

  // RRHH: se esconde casi todo PERO se deja el CONTROL DE TIEMPO (asistencia,
  // horarios, horas extra, banco de horas), el MONITOREO y los AVISOS/anuncios
  // de voz — por eso es por submódulo y no `true`. Lo que se esconde:
  HR: new Set([
    "Dashboard",
    "Empleados Activos", // /hr/personal y /hr/directorio
    "Candidatos",
    "Onboarding",
    "Offboarding",
    "Vacaciones",
    "Permisos",
    "Incidentes",
    "Desempeño",
    "Capacitación",
    "Directorio", // organización › directorio
    "Organigrama",
    "Deducciones", // nómina y deducciones
  ]),
  // NO listados (siguen visibles): "Asistencia", "Horarios", "Horarios Chatters",
  // "Horas Extra", "Banco de Horas", "Monitoreo", "Anuncios".
};

/** ¿Este módulo/submódulo está escondido para el equipo? (El admin ya pasó antes.) */
export function moduloEstaOculto(module: string, submodule?: string): boolean {
  const regla = MODULOS_OCULTOS[module];
  if (regla === undefined) return false;
  if (regla === true) return true; // módulo entero oculto
  // Set: oculto solo si el submódulo está en la lista. Un ítem sin submódulo, o
  // con un submódulo que no está listado, sigue visible.
  return submodule != null && regla.has(submodule);
}
