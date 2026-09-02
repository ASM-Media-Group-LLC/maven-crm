// Parser del sheet "PERSONALIZADOS" → filas listas para custom_requests.
//
// La gente COPIA las filas de la pestaña (con o sin encabezado) y las PEGA:
// Google Sheets manda TSV, con las celdas de varias líneas entre comillas.
// Columnas del sheet, en orden:
//   A Creadora · B Fecha de solicitud · C Estado · D Chatter · E Usuario ·
//   F ¿Cuánto ha gastado el user? · G Cuánto pagó · H Normal · I Buster ·
//   J Tipo de contenido · K Descripción · L Tiempo o cantidad · M Notas
// Es una función pura para poder testearla con filas reales del sheet.

import type { Agency, CanalVenta, Estado, TipoContenido } from "./types";

export interface FilaImportada {
  fila: number;
  creator_name: string;
  requested_on: string | null;   // YYYY-MM-DD; null si el sheet decía "SIN INFO" o venía vacío
  status: Estado;
  chatter_name: string | null;
  fan_handle: string;
  fan_total_spent_usd: number | null;
  price_usd: number | null;
  sale_channel: CanalVenta | null;
  content_type: TipoContenido | null;
  description: string;
  duration_or_qty: string | null;
  notes: string | null;
  avisos: string[];              // lo que no se pudo interpretar, para mostrarlo antes de importar
}

/** TSV con celdas entre comillas que pueden contener saltos de línea y tabs. */
export function parseTsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;
  const src = texto.replace(/\r\n?/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (enComillas) {
      if (c === '"') {
        if (src[i + 1] === '"') { celda += '"'; i++; }   // comilla escapada
        else enComillas = false;
      } else celda += c;
      continue;
    }
    if (c === '"' && celda === "") { enComillas = true; continue; }
    if (c === "\t") { fila.push(celda); celda = ""; continue; }
    if (c === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; continue; }
    celda += c;
  }
  if (celda !== "" || fila.length) { fila.push(celda); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim() !== ""));
}

const limpiar = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** "$ 5,850.00" · "643,25" · "$ -" → número o null. */
export function parseDinero(s: string | undefined): number | null {
  const t = limpiar(s).replace(/[$\s]/g, "");
  if (!t || t === "-") return null;
  // Formato europeo "643,25" (coma decimal, sin punto) vs "5,850.00" (coma de miles).
  const n = /^\d+,\d{1,2}$/.test(t) ? Number(t.replace(",", ".")) : Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** dd/mm/yyyy · d/m/yy · yyyy-mm-dd → YYYY-MM-DD; "SIN INFO"/vacío → null. */
export function parseFecha(s: string | undefined): string | null {
  const t = limpiar(s);
  if (!t || /sin info/i.test(t)) return null;
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    let y = Number(m[3]); if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? t : null;
}

export function parseEstado(s: string | undefined): Estado {
  const t = limpiar(s).toLowerCase();
  if (t.startsWith("entreg")) return "entregado";
  if (t.startsWith("deneg") || t.startsWith("rechaz")) return "denegado";
  if (t.startsWith("reembol")) return "reembolsado";
  // "Pendiente" en el sheet = ya vendido y esperando que la creadora lo haga.
  if (t.startsWith("pend")) return "en_produccion";
  if (t.startsWith("aprob")) return "aprobado";
  if (t.startsWith("listo")) return "listo";
  return "solicitado";
}

export function parseTipo(s: string | undefined): TipoContenido | null {
  const t = limpiar(s).toLowerCase();
  if (t.startsWith("foto")) return "foto";
  if (t.startsWith("vid")) return "video";
  if (t.startsWith("aud")) return "audio";
  if (t.startsWith("art")) return "articulo";
  return null;
}

const esCheck = (s: string | undefined) => /^(true|verdadero|sí|si|x|✓|☑)$/i.test(limpiar(s));

/** "Beto dCG\n@u160764328" → "u160764328"; "@alexsexo" → "alexsexo"; "Karl" → "Karl". */
export function parseFan(s: string | undefined): string {
  const raw = (s ?? "").trim();
  const con = raw.match(/@([\w.-]+)/);
  if (con) return con[1];
  return limpiar(raw).replace(/^@/, "");
}

const pareceEncabezado = (f: string[]) => /creadora|fecha/i.test(f[0] ?? "") || /estado/i.test(f[2] ?? "");

export function parseFilasSheet(texto: string): FilaImportada[] {
  const filas = parseTsv(texto);
  const out: FilaImportada[] = [];
  filas.forEach((f, idx) => {
    if (idx === 0 && pareceEncabezado(f)) return;
    // Pestañas con una fila de título ("ENERO") arriba del encabezado.
    if (f.filter((x) => x.trim()).length <= 1) return;
    const creator = limpiar(f[0]);
    const description = (f[10] ?? "").trim();
    const fan = parseFan(f[4]);
    const avisos: string[] = [];
    if (!creator) avisos.push("Sin creadora");
    if (!fan) avisos.push("Sin usuario");
    if (!description) avisos.push("Sin descripción");
    const requested_on = parseFecha(f[1]);
    if (!requested_on) avisos.push("Fecha ilegible (se usará la de hoy)");
    const normal = esCheck(f[7]); const buster = esCheck(f[8]);
    out.push({
      fila: idx + 1,
      creator_name: creator,
      requested_on,
      status: parseEstado(f[2]),
      chatter_name: limpiar(f[3]) || null,
      fan_handle: fan,
      fan_total_spent_usd: parseDinero(f[5]),
      price_usd: parseDinero(f[6]),
      sale_channel: buster ? "buster" : normal ? "normal" : null,
      content_type: parseTipo(f[9]),
      description,
      duration_or_qty: limpiar(f[11]) || null,
      notes: (f[12] ?? "").trim() || null,
      avisos,
    });
  });
  return out;
}

export interface Resolutores {
  creadoraId: (nombre: string) => string | null;
  chatterId: (nombre: string | null) => string | null;
}

/** Fila parseada → objeto listo para insertar en custom_requests. */
export function aPedido(f: FilaImportada, agency: Agency, sourceRef: string, r: Resolutores) {
  const hoy = new Date().toISOString().slice(0, 10);
  const paid = f.status === "entregado" || f.status === "en_produccion" ? f.price_usd : null;
  return {
    agency,
    creator_id: r.creadoraId(f.creator_name),
    creator_name: f.creator_name || "Sin creadora",
    chatter_id: r.chatterId(f.chatter_name),
    chatter_name: f.chatter_name,
    fan_handle: f.fan_handle || "sin-usuario",
    requested_on: f.requested_on ?? hoy,
    due_on: null,
    status: f.status,
    content_type: f.content_type,
    sale_channel: f.sale_channel,
    description: f.description || "(sin descripción en el sheet)",
    duration_or_qty: f.duration_or_qty,
    fan_total_spent_usd: f.fan_total_spent_usd,
    price_usd: f.price_usd,
    // Si ya se entregó o está en producción, en el sheet eso implicaba cobrado.
    paid_usd: paid,
    flags: [] as string[],
    notes: f.notes,
    source: "sheet",
    source_ref: `${sourceRef} · fila ${f.fila}`,
  };
}

/** Nombre → id, tolerante: sin tildes, sin mayúsculas, y acepta "Juan torres" ≈ "Juan Torres". */
export function resolutorPorNombre(lista: Array<{ id: string; nombre: string }>) {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const mapa = new Map(lista.map((x) => [norm(x.nombre), x.id]));
  return (nombre: string | null): string | null => {
    if (!nombre) return null;
    const n = norm(nombre);
    if (mapa.has(n)) return mapa.get(n)!;
    // Primer nombre + primer apellido ("Vanessa Giraldo" vs "Vanessa Giraldo Mejía").
    for (const [k, id] of mapa) if (k.startsWith(n) || n.startsWith(k)) return id;
    return null;
  };
}
