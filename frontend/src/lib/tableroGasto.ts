// EL TABLERO DE GASTO DE MAVEN (Alvaro, 14/11/2026). Va arriba de todo en Costos.
// «Una cosa es cuánto he gastado ahorita, otra la proyección.» Decidió:
//   · el número grande es lo GASTADO en lo que va del mes; la proyección, al lado;
//   · la IA de Argos sale de «Maven en vivo + cuadre con Google»: la última lectura
//     de AI Studio (lo que Google dice que va gastado hasta esa fecha) y, después,
//     lo que Maven calcula foto por foto (fotos juzgadas × precio). Los días que
//     cubre la lectura se escalan para que sumen lo que dijo Google;
//   · lo que se cobra por mes (servidores, correo) cuenta la parte de los días que van;
//   · lo que se paga una vez o al año (el dominio) NO entra en el mes (15/11: «dejas
//     cosas que son one time versus el mes»): va aparte, con su monto entero y su fecha;
//   · cada servicio con su gastado y su mes; lo que falta (sin monto) y dónde ahorrar.
// Un dato que falta es null, nunca 0. Si el uso no se pudo leer, Argos queda en null.

import { mensual, num, type Cobro } from "@/lib/costos";
import { diasDelMes, parteDe, proyectar, type ServicioConParte, type UsoDelMes } from "@/lib/costosPorParte";

export interface FilaGasto {
  id: string;
  nombre: string;
  proveedor: string;
  /** Lo gastado del 1 a hoy. null = no se pudo calcular. */
  gastado: number | null;
  /** El mes completo (fijo: su mes; por uso: al ritmo de lo que va). */
  alMes: number | null;
  porUso: boolean;
}

export interface DiaGasto { dia: string; fijo: number; argos: number; futuro: boolean }

export interface Lectura { fecha: string; monto: number; nota: string | null }

/** Un pago que no es del mes (al año o de una vez): monto entero y cuándo se cobra. */
export interface PagoAparte {
  id: string;
  nombre: string;
  proveedor: string;
  monto: number;
  ciclo: "anual";
  /** Próximo cobro (YYYY-MM-DD) o null si no se sabe. */
  proximo: string | null;
  /** El cobro cae en este mes. */
  esteMes: boolean;
}

export interface TableroGasto {
  dia: number;
  diasDelMes: number;
  gastado: number;
  hoy: number;
  proyeccion: number;
  filas: FilaGasto[];
  argos: { gastado: number | null; lectura: Lectura | null; despues: number | null } | null;
  /** Servicios de Maven sin monto (no suman): «lo que falta». */
  falta: ServicioConParte[];
  /** Lo que se paga al año o una vez: no suma en el mes, va aparte. */
  aparte: PagoAparte[];
  ahorro: { id: string; nombre: string; ahorro: number; detalle: string }[];
  serie: DiaGasto[];
  /** El uso del mes no se pudo leer: Argos no se calcula (se dice, no se pone 0). */
  sinUso: boolean;
}

const dos = (n: number) => Math.round(n * 100) / 100;

const esPorFoto = (s: ServicioConParte) => s.unidad === "foto_juzgada" && num(s.precio_unitario_usd) !== null;

/** La última lectura del proveedor en este mes, hasta hoy. */
export function ultimaLectura(lecturas: readonly Cobro[], servicioId: string, hoy: string): Lectura | null {
  const mes = hoy.slice(0, 7);
  let mejor: Cobro | null = null;
  for (const l of lecturas) {
    if (l.servicio_id !== servicioId || l.fuente !== "lectura" || l.fecha.slice(0, 7) !== mes || l.fecha > hoy) continue;
    if (!mejor || l.fecha > mejor.fecha) mejor = l;
  }
  return mejor ? { fecha: mejor.fecha, monto: num(mejor.monto_usd) ?? 0, nota: mejor.nota } : null;
}

/**
 * Lo de Argos día por día: hasta la fecha de la lectura, lo que dijo Google
 * (repartido con la forma de las fotos de cada día); después, fotos × precio.
 */
export function argosPorDia(uso: UsoDelMes, precio: number, lectura: Lectura | null): Map<string, number> {
  const est = new Map<string, number>();
  for (const d of uso.dias) est.set(d.dia, (num(d.juzgadas) ?? 0) * precio);
  const out = new Map<string, number>();
  if (!lectura) {
    est.forEach((v, k) => out.set(k, dos(v)));
    return out;
  }
  const cubiertos = uso.dias.filter((d) => lectura.fecha >= d.dia);
  const sumaEst = cubiertos.reduce((a, d) => a + (est.get(d.dia) ?? 0), 0);
  for (const d of uso.dias) {
    if (lectura.fecha >= d.dia) {
      const v = sumaEst > 0 ? (est.get(d.dia) ?? 0) * (lectura.monto / sumaEst) : lectura.monto / Math.max(cubiertos.length, 1);
      out.set(d.dia, dos(v));
    } else {
      out.set(d.dia, dos(est.get(d.dia) ?? 0));
    }
  }
  return out;
}

export function calcularTableroGasto(
  servicios: readonly ServicioConParte[],
  lecturas: readonly Cobro[],
  uso: UsoDelMes | null,
  hoyFecha: string,
): TableroGasto {
  const hoy = uso?.hoy ?? hoyFecha;
  const mes = hoy.slice(0, 7);
  const dia = Number(hoy.slice(8, 10));
  const dias = uso?.dias_del_mes ?? diasDelMes(hoy);
  const deMaven = servicios.filter((s) => s.activo && s.es_maven && parteDe(s) !== "otras");

  const filas: FilaGasto[] = [];
  const falta: ServicioConParte[] = [];
  const aparte: PagoAparte[] = [];
  let fijoDelDia = 0;
  let argos: TableroGasto["argos"] = null;
  let argosHoy = 0;
  let argosPorDiaMapa: Map<string, number> | null = null;
  let sinUso = false;

  for (const s of deMaven) {
    if (esPorFoto(s)) {
      const precio = num(s.precio_unitario_usd) ?? 0;
      const lectura = ultimaLectura(lecturas, s.id, hoy);
      if (!uso) {
        sinUso = true;
        argos = { gastado: null, lectura, despues: null };
        filas.push({ id: s.id, nombre: s.nombre, proveedor: s.proveedor, gastado: null, alMes: null, porUso: true });
        continue;
      }
      const porDia = argosPorDia(uso, precio, lectura);
      argosPorDiaMapa = porDia;
      let gastado = 0;
      let despues = 0;
      porDia.forEach((v, k) => {
        if (k > hoy) return;
        gastado += v;
        if (lectura && k > lectura.fecha) despues += v;
      });
      gastado = dos(gastado);
      argosHoy = porDia.get(hoy) ?? 0;
      argos = { gastado, lectura, despues: lectura ? dos(despues) : null };
      filas.push({ id: s.id, nombre: s.nombre, proveedor: s.proveedor, gastado, alMes: proyectar(gastado, dia, dias), porUso: true });
      continue;
    }
    if (s.ciclo === "anual") {
      const monto = num(s.monto_usd);
      if (monto === null) { falta.push(s); continue; }
      const proximo = s.proximo_cobro ?? null;
      aparte.push({ id: s.id, nombre: s.nombre, proveedor: s.proveedor, monto, ciclo: "anual", proximo, esteMes: !!proximo && proximo.slice(0, 7) === mes });
      continue;
    }
    const alMes = mensual(s);
    if (alMes === null) { falta.push(s); continue; }
    fijoDelDia += alMes / dias;
    filas.push({ id: s.id, nombre: s.nombre, proveedor: s.proveedor, gastado: dos((alMes * dia) / dias), alMes: dos(alMes), porUso: false });
  }

  filas.sort((a, b) => (b.gastado ?? -1) - (a.gastado ?? -1));
  const gastado = dos(filas.reduce((a, f) => a + (f.gastado ?? 0), 0));
  const proyeccion = dos(filas.reduce((a, f) => a + (f.alMes ?? 0), 0));

  const ritmoArgos = argos?.gastado != null ? argos.gastado / Math.max(dia, 1) : 0;
  const serie: DiaGasto[] = [];
  for (let d = 1; d <= dias; d++) {
    const fecha = `${mes}-${String(d).padStart(2, "0")}`;
    const futuro = d > dia;
    serie.push({
      dia: fecha,
      fijo: dos(fijoDelDia),
      argos: futuro ? dos(ritmoArgos) : (argosPorDiaMapa?.get(fecha) ?? 0),
      futuro,
    });
  }

  const ahorro = servicios
    .filter((s) => s.activo && (num(s.ahorro_usd) ?? 0) > 0 && !!s.ahorro_detalle)
    .map((s) => ({ id: s.id, nombre: s.nombre, ahorro: num(s.ahorro_usd) ?? 0, detalle: s.ahorro_detalle ?? "" }))
    .sort((a, b) => b.ahorro - a.ahorro);

  return {
    dia, diasDelMes: dias, gastado, hoy: dos(fijoDelDia + argosHoy), proyeccion,
    filas, argos, falta, aparte, ahorro, serie, sinUso,
  };
}
