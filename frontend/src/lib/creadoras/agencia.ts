// LA AGENCIA DE UNA CREADORA: una sola regla para todas las pantallas (la tabla,
// las tarjetas, el dashboard, el filtro, la ficha y el alta).
//
// Cada agencia de Maven tiene sus opciones en agencia_lineas
// (supabase/migrations/20261006130000_agencia_lineas.sql). Kash: Kash Plus, Kash
// Massive y Atomick. Una agencia sin líneas no elige: su creadora es de ella, con
// el nombre con el que está registrada en Maven.
//
// En la ficha (creator_business) hay tres datos viejos que se cruzan: el texto
// assigned_agency, la compañía (company_id → scouter_companies) y kash_type (el
// tier, que BLU pone solo). Lo que se muestra sale, en este orden, de:
//   1. kash_type → la línea de ese tier (BLU manda);
//   2. el texto o la compañía con el nombre (o un alias) de una línea;
//   3. la compañía, si es de UNA sola línea;
//   4. lo que haya guardado (p. ej. «Kash» sin tier todavía, o una vieja).

export interface LineaDeAgencia {
  id: string;
  nombre: string;
  orden: number;
  company_id: string | null;
  kash_type: "Plus" | "Massive" | null;
  alias: string[];
}

export interface NegocioDeCreadora {
  assigned_agency?: string | null;
  company_id?: string | null;
  kash_type?: string | null;
  company?: { id?: string; name?: string | null } | null;
}

const normal = (s: string) => s.trim().toLowerCase();

export function agenciaDe(cb: NegocioDeCreadora | null | undefined, lineas: readonly LineaDeAgencia[], agenciaPropia = ""): string {
  if (!lineas.length) return cb?.assigned_agency || cb?.company?.name || agenciaPropia;
  if (!cb) return "";
  if (cb.kash_type) {
    const porTier = lineas.find((l) => l.kash_type === cb.kash_type);
    if (porTier) return porTier.nombre;
  }
  const textos = [cb.assigned_agency, cb.company?.name].filter((x): x is string => !!x).map(normal);
  const porNombre = lineas.find((l) => [l.nombre, ...l.alias].some((n) => textos.includes(normal(n))));
  if (porNombre) return porNombre.nombre;
  const porCompania = lineas.filter((l) => l.company_id && l.company_id === cb.company_id);
  if (porCompania.length === 1) return porCompania[0].nombre;
  return cb.company?.name || cb.assigned_agency || "";
}

/** Lo que se guarda en creator_business al elegir una opción (o la agencia propia). */
export function negocioDeLaOpcion(
  elegida: string,
  lineas: readonly LineaDeAgencia[],
  agenciaPropia: string,
): { assigned_agency: string | null; company_id: string | null; kash_type?: "Plus" | "Massive" } {
  if (!lineas.length) return { assigned_agency: agenciaPropia || null, company_id: null };
  const l = lineas.find((x) => x.nombre === elegida);
  if (!l) return { assigned_agency: elegida || null, company_id: null };
  // El tier solo se escribe si la línea lo dice: elegir Atomick no le borra a
  // nadie el Plus/Massive que haya puesto BLU.
  return { assigned_agency: l.nombre, company_id: l.company_id, ...(l.kash_type ? { kash_type: l.kash_type } : {}) };
}

/** Las opciones del filtro: las líneas, en su orden, y después lo que haya en las fichas que no sea una. */
export function opcionesDelFiltro(nombres: Iterable<string>, lineas: readonly LineaDeAgencia[]): string[] {
  const deLineas = [...lineas].sort((a, b) => a.orden - b.orden).map((l) => l.nombre);
  const otras = [...new Set(nombres)].filter((n) => n && !deLineas.includes(n)).sort((a, b) => a.localeCompare(b));
  return [...deLineas, ...otras];
}
