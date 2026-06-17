// PostgREST corta en 1000 filas por request (db-max-rows del proyecto Supabase).
// Para AGREGADOS que necesitan TODAS las filas (analítica, conteos client-side),
// hay que paginar con .range() hasta agotar — si no, una tabla con >1000 filas
// se trunca SILENCIOSAMENTE (sin error) y los totales/gráficos quedan mal.
//
// `build(from, to)` debe devolver un query builder de supabase con .range(from, to)
// ya aplicado. Reconstruí los filtros/orden DENTRO de build (se llama por página).
//
//   const rows = await fetchAllRows((from, to) =>
//     supabase.from("closers_contacts").select("id, status").range(from, to));
export async function fetchAllRows(
  build: (from: number, to: number) => PromiseLike<any>,
  pageSize = 1000,
): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const rows: any[] = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}
