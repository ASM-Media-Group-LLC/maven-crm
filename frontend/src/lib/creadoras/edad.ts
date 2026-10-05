// LA EDAD SALE DE LA FECHA DE NACIMIENTO (Jhon, 06/10): en el alta se pedían
// las dos a mano y podían no coincidir. Aparte de los formularios para poder
// probarla sin dibujarlos.

/** Años cumplidos a `hoy` de quien nació en `fecha` ("yyyy-MM-dd", como la
 *  guarda DateInput). Sin una fecha real (31/02, texto) o si es futura, null.
 *  Se cuenta por calendario (año, mes y día), sin horas: una fecha guardada
 *  sin zona horaria no cambia de día según dónde se abra la ficha. */
export function edadDesde(fecha: string | null | undefined, hoy: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha?.trim() ?? "");
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(anio, mes - 1, dia));
  if (real.getUTCFullYear() !== anio || real.getUTCMonth() !== mes - 1 || real.getUTCDate() !== dia) return null;
  let edad = hoy.getFullYear() - anio;
  const mesHoy = hoy.getMonth() + 1;
  if (mesHoy < mes || (mesHoy === mes && hoy.getDate() < dia)) edad--;
  return edad >= 0 ? edad : null;
}
