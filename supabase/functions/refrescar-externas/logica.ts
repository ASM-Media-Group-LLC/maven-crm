// Cómo se guarda el resumen de Kash en organizaciones_externas (edificio).
// kash-resumen da el gasto de Argos de HOY; el del mes se arma aquí sumando los días
// que se fueron guardando (gasto_por_dia), sin pedirle a Kash que recorra el mes.

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

/** Día de Bogotá (UTC−5) en AAAA-MM-DD. */
export function diaBogota(ahora: Date): string {
  return new Date(ahora.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

/** Junta el resumen nuevo con lo guardado: guarda el gasto de hoy en su día, se queda
 *  con este mes y el anterior, y suma el del mes. Solo números (lo que manda Kash). */
export function juntarResumen(anterior: Obj | null | undefined, nuevo: Obj, ahora: Date): Obj {
  const hoy = diaBogota(ahora);
  const mes = hoy.slice(0, 7);
  const previo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const dias: Record<string, number> = {};
  for (const [d, v] of Object.entries((anterior?.gasto_por_dia ?? {}) as Record<string, unknown>)) {
    if (/^\d{4}-\d\d-\d\d$/.test(d) && (d.startsWith(mes) || d.startsWith(previo)) && Number.isFinite(Number(v))) dias[d] = Number(v);
  }
  if (typeof nuevo.argos_gasto_hoy_usd === "number") dias[hoy] = nuevo.argos_gasto_hoy_usd;
  const delMes = Object.entries(dias).filter(([d]) => d.startsWith(mes)).reduce((a, [, v]) => a + v, 0);
  return {
    ...nuevo,
    gasto_por_dia: dias,
    argos_gastado_mes_usd: Math.round(delMes * 100) / 100,
    // Desde cuándo hay datos del mes (antes de conectar la función no hay).
    argos_gastado_mes_desde: Object.keys(dias).filter((d) => d.startsWith(mes)).sort()[0] ?? null,
  };
}
