import type { TranslationKey } from "@/lib/i18n";
import { ESTADOS, minutos, type EstadoMinuto, type Jornada } from "@/lib/argosJornada";

// EXPORTAR EL DÍA O LA SEMANA DE ARGOS a Excel (Alvaro, 11/11/2026). El «Exportar
// horas» de siempre arma una hoja de TODO el equipo en Oficina; esto es el detalle
// de UNA persona, minuto a minuto, para guardarlo o mandarlo. xlsx se carga solo
// al hacer clic (pesa ~140 KB).

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

const NOMBRE: Record<EstadoMinuto, TranslationKey> = {
  bien: "argos.estado.bien", pausa: "argos.estado.pausa", sin_pantalla: "argos.estado.sin_pantalla",
  sin_camara: "argos.estado.sin_camara", fuera_de_camara: "argos.estado.fuera_de_camara", distraido: "argos.estado.distraido",
  pausa_de_mas: "argos.estado.pausa_de_mas", fuera_cowork: "argos.estado.fuera_cowork", no_entro: "argos.estado.no_entro",
  se_fue: "argos.estado.se_fue", pendiente: "argos.estado.pendiente",
};

const horaB = (ms: number) => new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/Bogota" });
const pctTexto = (v: number | null) => (v === null ? "" : Math.round(v * 100));
const archivo = (nombre: string, sufijo: string) =>
  `argos-${nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${sufijo}.xlsx`;
/** Excel no deja más de 31 caracteres ni algunos signos en el nombre de una hoja. */
const hoja = (s: string) => s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);

function porEstado(j: Jornada, t: Tr): Record<string, number> {
  return Object.fromEntries(ESTADOS.filter((e) => e !== "pendiente").map((e) => [t(NOMBRE[e]), minutos(j.seg[e])]));
}

/** Filas de la semana (una por día): para la hoja y para probarla sin xlsx. */
export function filasSemana(dias: Jornada[], t: Tr): Record<string, string | number>[] {
  return dias.map((d) => ({
    [t("argos.exportar.col.dia")]: d.fecha,
    [t("argos.exportar.col.entro")]: d.entro ? horaB(d.entro) : "",
    [t("argos.exportar.col.salio")]: d.salio ? horaB(d.salio) : "",
    [t("argos.exportar.col.conectado")]: minutos(d.conectadoSeg),
    [t("argos.exportar.col.pctBien")]: pctTexto(d.pctBien),
    [t("argos.exportar.col.productivas")]: d.horasProductivas,
    [t("argos.exportar.col.evaluadas")]: d.horasEvaluadas,
    ...porEstado(d, t),
    [t("argos.exportar.col.fallas")]: d.fallas.length,
  }));
}

/** Las hojas del día: resumen, hora por hora, fallas y el minuto a minuto (cada tramo). */
export function hojasDia(j: Jornada, nombre: string, t: Tr): Record<string, Record<string, string | number>[]> {
  const resumen = [
    { [t("argos.exportar.col.concepto")]: t("argos.exportar.persona"), [t("argos.exportar.col.valor")]: nombre },
    { [t("argos.exportar.col.concepto")]: t("argos.exportar.col.dia"), [t("argos.exportar.col.valor")]: j.fecha },
    { [t("argos.exportar.col.concepto")]: t("argos.exportar.turno"), [t("argos.exportar.col.valor")]: `${horaB(j.inicio)} – ${horaB(j.fin)}` },
    { [t("argos.exportar.col.concepto")]: t("argos.exportar.col.pctBien"), [t("argos.exportar.col.valor")]: pctTexto(j.pctBien) },
    { [t("argos.exportar.col.concepto")]: t("argos.exportar.col.conectado"), [t("argos.exportar.col.valor")]: minutos(j.conectadoSeg) },
    ...Object.entries(porEstado(j, t)).map(([k, v]) => ({ [t("argos.exportar.col.concepto")]: k, [t("argos.exportar.col.valor")]: v })),
    { [t("argos.exportar.col.concepto")]: t("argos.exportar.col.fallas"), [t("argos.exportar.col.valor")]: j.fallas.length },
    { [t("argos.exportar.col.concepto")]: t("argos.exportar.col.productivas"), [t("argos.exportar.col.valor")]: `${j.horasProductivas} / ${j.horasEvaluadas}` },
  ];
  const porHora = j.horas.map((h) => ({
    [t("argos.exportar.col.hora")]: horaB(h.desde),
    [t("argos.exportar.col.pctBien")]: pctTexto(h.pctBien),
    [t("argos.exportar.col.productiva")]: h.productiva === null ? "" : h.productiva ? t("argos.exportar.si") : t("argos.exportar.no"),
    ...Object.fromEntries(ESTADOS.filter((e) => e !== "pendiente").map((e) => [t(NOMBRE[e]), minutos(h.seg[e])])),
    [t("argos.exportar.col.fallas")]: h.fallas.length,
  }));
  const fallas = j.fallas.map((f) => ({
    [t("argos.exportar.col.desde")]: horaB(f.desde),
    [t("argos.exportar.col.hasta")]: horaB(f.hasta),
    [t("argos.exportar.col.estado")]: t(NOMBRE[f.estado]),
    [t("argos.exportar.col.minutos")]: Math.round((f.seg / 60) * 10) / 10,
  }));
  const tramos = j.tramos.map((tr) => ({
    [t("argos.exportar.col.desde")]: horaB(tr.desde),
    [t("argos.exportar.col.hasta")]: horaB(tr.hasta),
    [t("argos.exportar.col.estado")]: t(NOMBRE[tr.estado]),
    [t("argos.exportar.col.minutos")]: Math.round(((tr.hasta - tr.desde) / 60_000) * 10) / 10,
  }));
  return {
    [hoja(t("argos.exportar.hoja.resumen"))]: resumen,
    [hoja(t("argos.exportar.hoja.porHora"))]: porHora,
    [hoja(t("argos.exportar.hoja.fallas"))]: fallas,
    [hoja(t("argos.exportar.hoja.minuto"))]: tramos,
  };
}

async function escribir(hojas: Record<string, Record<string, string | number>[]>, nombreArchivo: string): Promise<void> {
  const XLSX = await import("xlsx");
  const libro = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas.length ? filas : [{}]), nombre);
  }
  XLSX.writeFile(libro, nombreArchivo);
}

export function exportarDia(j: Jornada, nombre: string, t: Tr): Promise<void> {
  return escribir(hojasDia(j, nombre, t), archivo(nombre, j.fecha));
}

export function exportarSemana(dias: Jornada[], nombre: string, t: Tr): Promise<void> {
  const desde = dias[0]?.fecha ?? "";
  return escribir({ [hoja(t("argos.exportar.hoja.semana"))]: filasSemana(dias, t) }, archivo(nombre, `semana-${desde}`));
}
